use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const TRAILING_BUFFER_SIZE: usize = 1024;
const DEFAULT_IDLE_TIMEOUT_SECS: u64 = 8;
const MAX_IDLE_TIMEOUT_SECS: u64 = 120;
const IDLE_CHECK_INTERVAL: Duration = Duration::from_millis(500);

static IDLE_TIMEOUT_SECS: AtomicU64 = AtomicU64::new(DEFAULT_IDLE_TIMEOUT_SECS);

pub fn get_idle_timeout_secs() -> u64 {
    IDLE_TIMEOUT_SECS.load(Ordering::Relaxed)
}

pub fn set_idle_timeout_secs(secs: u64) -> u64 {
    if secs == 0 {
        return get_idle_timeout_secs();
    }
    let clamped = secs.min(MAX_IDLE_TIMEOUT_SECS);
    IDLE_TIMEOUT_SECS.store(clamped, Ordering::Relaxed);
    clamped
}

fn idle_timeout() -> Duration {
    Duration::from_secs(IDLE_TIMEOUT_SECS.load(Ordering::Relaxed))
}

#[tauri::command]
pub fn get_idle_timeout() -> u64 {
    get_idle_timeout_secs()
}

#[tauri::command]
pub fn set_idle_timeout(secs: u64) -> u64 {
    set_idle_timeout_secs(secs)
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub enum SessionStatus {
    Working,
    Idle,
    WaitingForInput,
    NeedsPermission,
    ClaudeNeedsInput,
    Error,
    ClaudeFinished,
    Exited,
}

impl SessionStatus {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Working => "Working",
            Self::Idle => "Idle",
            Self::WaitingForInput => "WaitingForInput",
            Self::NeedsPermission => "NeedsPermission",
            Self::ClaudeNeedsInput => "ClaudeNeedsInput",
            Self::Error => "Error",
            Self::ClaudeFinished => "ClaudeFinished",
            Self::Exited => "Exited",
        }
    }
}

pub struct StatusState {
    pub current: SessionStatus,
    pub last_output_time: Instant,
    trailing_buffer: Vec<u8>,
}

impl StatusState {
    pub fn new() -> Self {
        Self {
            current: SessionStatus::Idle,
            last_output_time: Instant::now(),
            trailing_buffer: Vec::with_capacity(TRAILING_BUFFER_SIZE),
        }
    }
}

#[derive(Clone, Serialize)]
pub struct StatusEvent {
    pub session_id: String,
    pub status: String,
    pub exit_code: Option<i32>,
}

static STATUS_MAP: std::sync::LazyLock<Mutex<HashMap<String, StatusState>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static IDLE_CHECKER_STARTED: OnceLock<()> = OnceLock::new();

pub fn init(app: &AppHandle) {
    let _ = APP_HANDLE.set(app.clone());

    // Start idle checker once
    IDLE_CHECKER_STARTED.get_or_init(|| {
        let handle = app.clone();
        std::thread::spawn(move || idle_checker_loop(handle));
    });
}

pub fn register_session(session_id: &str) {
    if let Ok(mut map) = STATUS_MAP.lock() {
        map.insert(session_id.to_string(), StatusState::new());
    }
}

pub fn unregister_session(session_id: &str) {
    if let Ok(mut map) = STATUS_MAP.lock() {
        map.remove(session_id);
    }
}

pub fn get_status(session_id: &str) -> String {
    if let Ok(map) = STATUS_MAP.lock() {
        if let Some(state) = map.get(session_id) {
            return state.current.as_str().to_string();
        }
    }
    "Unknown".to_string()
}

/// Called from the PTY read thread with each chunk of output.
/// Returns Some(new_status) if the status changed.
pub fn on_output(session_id: &str, data: &[u8]) -> Option<SessionStatus> {
    let mut map = STATUS_MAP.lock().ok()?;
    let state = map.get_mut(session_id)?;

    // Update trailing buffer
    state.trailing_buffer.extend_from_slice(data);
    if state.trailing_buffer.len() > TRAILING_BUFFER_SIZE {
        let excess = state.trailing_buffer.len() - TRAILING_BUFFER_SIZE;
        state.trailing_buffer.drain(..excess);
    }

    state.last_output_time = Instant::now();

    // Analyze the trailing buffer
    let new_status = analyze_buffer(&state.trailing_buffer);

    if new_status != state.current {
        state.current = new_status.clone();
        return Some(new_status);
    }

    None
}

/// Called when a PTY read loop exits (EOF or error).
pub fn on_exit(session_id: &str, exit_code: i32) {
    if let Ok(mut map) = STATUS_MAP.lock() {
        if let Some(state) = map.get_mut(session_id) {
            state.current = SessionStatus::Exited;
        }
    }

    emit_status(session_id, "Exited", Some(exit_code));
}

/// Strip ANSI escape sequences from text for reliable pattern matching.
fn strip_ansi(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // Skip CSI sequences: ESC [ ... letter
            if chars.peek() == Some(&'[') {
                chars.next(); // consume '['
                while let Some(&next) = chars.peek() {
                    chars.next();
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            // Skip OSC sequences: ESC ] ... BEL or ESC \
            } else if chars.peek() == Some(&']') {
                chars.next();
                while let Some(&next) = chars.peek() {
                    if next == '\x07' {
                        chars.next();
                        break;
                    }
                    if next == '\x1b' {
                        chars.next();
                        if chars.peek() == Some(&'\\') {
                            chars.next();
                        }
                        break;
                    }
                    chars.next();
                }
            } else {
                // Skip other single-char escapes
                chars.next();
            }
        } else {
            result.push(c);
        }
    }
    result
}

fn analyze_buffer(buffer: &[u8]) -> SessionStatus {
    let raw = String::from_utf8_lossy(buffer);
    let text = strip_ansi(&raw);
    let tail = if text.len() > 800 {
        let mut start = text.len() - 800;
        while start < text.len() && !text.is_char_boundary(start) {
            start += 1;
        }
        &text[start..]
    } else {
        &text
    };

    let tail_lower = tail.to_lowercase();

    // Claude Code specific: plan approval, input needed, attention needed
    if tail_lower.contains("claude code needs your approval")
        || tail_lower.contains("claude code needs your input")
        || tail_lower.contains("claude code needs your attention")
    {
        return SessionStatus::ClaudeNeedsInput;
    }

    // Claude Code permission prompts (tool use approval)
    if tail_lower.contains("claude needs your permission") {
        return SessionStatus::WaitingForInput;
    }

    // Check for input prompts
    if tail.contains("(y/n)") || tail.contains("(Y/n)") || tail.contains("(yes/no)") {
        return SessionStatus::WaitingForInput;
    }

    // Check for Claude Code permission prompts
    if tail_lower.contains("allow") && (tail_lower.contains("once") || tail_lower.contains("always")) {
        return SessionStatus::WaitingForInput;
    }

    // Check for permission/sudo
    if tail_lower.contains("permission denied") || tail_lower.contains("sudo:") {
        return SessionStatus::NeedsPermission;
    }

    // Check for Claude Code task completion
    if tail_lower.contains("total cost:") || tail_lower.contains("total tokens:") {
        return SessionStatus::ClaudeFinished;
    }

    // Error patterns anchored to the last 3 lines only to avoid false positives
    // from help text, test output, code comments, etc.
    let recent = last_n_lines(tail, 3).to_lowercase();
    if recent.contains("command not found")
        || recent.contains("no such file or directory")
        || recent.contains("panic:")
        || recent.contains("traceback (most recent call last)")
        || recent.contains("syntaxerror:")
        || recent.contains("typeerror:")
        || recent.contains("referenceerror:")
    {
        return SessionStatus::Error;
    }

    // If we just received output, we're working
    SessionStatus::Working
}

pub fn emit_status(session_id: &str, status: &str, exit_code: Option<i32>) {
    if let Some(handle) = APP_HANDLE.get() {
        let _ = handle.emit(
            "session-status-changed",
            StatusEvent {
                session_id: session_id.to_string(),
                status: status.to_string(),
                exit_code,
            },
        );
    }
}

fn last_n_lines(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let start = if lines.len() > n { lines.len() - n } else { 0 };
    lines[start..].join("\n")
}

fn idle_checker_loop(handle: AppHandle) {
    loop {
        std::thread::sleep(IDLE_CHECK_INTERVAL);

        let transitions: Vec<(String, SessionStatus)> = {
            let mut map = match STATUS_MAP.lock() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let now = Instant::now();
            let mut changes = Vec::new();

            for (id, state) in map.iter_mut() {
                if state.current == SessionStatus::Working
                    && now.duration_since(state.last_output_time) > idle_timeout()
                {
                    state.current = SessionStatus::Idle;
                    changes.push((id.clone(), SessionStatus::Idle));
                }
            }

            changes
        };

        // Emit events outside the lock
        for (id, status) in transitions {
            let _ = handle.emit(
                "session-status-changed",
                StatusEvent {
                    session_id: id,
                    status: status.as_str().to_string(),
                    exit_code: None,
                },
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // B1: Case-insensitive pattern matching

    #[test]
    fn total_cost_lowercase() {
        assert_eq!(analyze_buffer(b"output\ntotal cost: $0.50\n"), SessionStatus::ClaudeFinished);
    }

    #[test]
    fn total_cost_titlecase() {
        assert_eq!(analyze_buffer(b"some output\nTotal Cost: $1.23\n"), SessionStatus::ClaudeFinished);
    }

    #[test]
    fn total_cost_uppercase() {
        assert_eq!(analyze_buffer(b"some output\nTOTAL COST: $2.00\n"), SessionStatus::ClaudeFinished);
    }

    #[test]
    fn total_tokens_case_insensitive() {
        assert_eq!(analyze_buffer(b"Total Tokens: 1234\n"), SessionStatus::ClaudeFinished);
    }

    #[test]
    fn claude_needs_input_mixed_case() {
        assert_eq!(analyze_buffer(b"claude code needs your Input\n"), SessionStatus::ClaudeNeedsInput);
    }

    #[test]
    fn claude_needs_approval_mixed_case() {
        assert_eq!(analyze_buffer(b"Claude code needs your Approval\n"), SessionStatus::ClaudeNeedsInput);
    }

    #[test]
    fn larger_tail_window_catches_distant_pattern() {
        let mut buf = b"Total cost: $1.00\n".to_vec();
        buf.extend_from_slice(&vec![b'x'; 600]);
        assert_eq!(analyze_buffer(&buf), SessionStatus::ClaudeFinished);
    }

    #[test]
    fn working_for_generic_output() {
        assert_eq!(analyze_buffer(b"compiling main.rs...\n"), SessionStatus::Working);
    }

    #[test]
    fn idle_for_empty_buffer() {
        assert_eq!(analyze_buffer(b""), SessionStatus::Working);
    }

    // B2: Error detection anchored to last lines

    #[test]
    fn command_not_found_in_last_line_is_error() {
        assert_eq!(analyze_buffer(b"$ foobar\nfoobar: command not found\n"), SessionStatus::Error);
    }

    #[test]
    fn command_not_found_in_help_text_is_not_error() {
        let buf = b"If you see 'command not found', install the tool first.\nMore help text here.\n$ ";
        assert_eq!(analyze_buffer(buf), SessionStatus::Working);
    }

    #[test]
    fn panic_in_code_comment_is_not_error() {
        let buf = b"// if data is nil, panic: bad input\nfunc main() {\n    fmt.Println(\"ok\")\n}\n$ ";
        assert_eq!(analyze_buffer(buf), SessionStatus::Working);
    }

    #[test]
    fn typeerror_in_test_output_is_not_error() {
        let buf = b"PASS tests/foo.test.js\n  check TypeError handling\n  2 tests passed\n$ ";
        assert_eq!(analyze_buffer(buf), SessionStatus::Working);
    }

    #[test]
    fn real_panic_at_end_is_error() {
        let buf = b"thread 'main' panicked at 'index out of bounds'\npanic: runtime error\n";
        assert_eq!(analyze_buffer(buf), SessionStatus::Error);
    }

    #[test]
    fn real_traceback_at_end_is_error() {
        let buf = b"Traceback (most recent call last)\n  File 'main.py', line 1\nNameError: x\n";
        assert_eq!(analyze_buffer(buf), SessionStatus::Error);
    }

    #[test]
    fn real_syntax_error_at_end_is_error() {
        let buf = b"  File \"test.py\", line 3\n    print(\nSyntaxError: unexpected EOF\n";
        assert_eq!(analyze_buffer(buf), SessionStatus::Error);
    }

    // B2: last_n_lines helper

    #[test]
    fn last_n_lines_returns_last_3() {
        let text = "line1\nline2\nline3\nline4\nline5\n";
        let result = last_n_lines(text, 3);
        assert_eq!(result, "line3\nline4\nline5");
    }

    #[test]
    fn last_n_lines_short_input() {
        let text = "only\n";
        let result = last_n_lines(text, 3);
        assert_eq!(result, "only");
    }

    #[test]
    fn last_n_lines_skips_empty_lines() {
        let text = "line1\n\n\nline2\n\n";
        let result = last_n_lines(text, 2);
        assert_eq!(result, "line1\nline2");
    }

    // B1: ANSI stripping

    #[test]
    fn strip_ansi_removes_color_codes() {
        let text = "\x1b[32mTotal cost:\x1b[0m $1.23";
        assert_eq!(strip_ansi(text), "Total cost: $1.23");
    }

    #[test]
    fn strip_ansi_preserves_plain_text() {
        assert_eq!(strip_ansi("hello world"), "hello world");
    }

    // B3: Configurable idle timeout

    #[test]
    fn idle_timeout_defaults_to_8() {
        IDLE_TIMEOUT_SECS.store(DEFAULT_IDLE_TIMEOUT_SECS, Ordering::Relaxed);
        assert_eq!(get_idle_timeout_secs(), 8);
    }

    #[test]
    fn set_idle_timeout_updates_value() {
        IDLE_TIMEOUT_SECS.store(DEFAULT_IDLE_TIMEOUT_SECS, Ordering::Relaxed);
        set_idle_timeout_secs(15);
        assert_eq!(get_idle_timeout_secs(), 15);
        IDLE_TIMEOUT_SECS.store(DEFAULT_IDLE_TIMEOUT_SECS, Ordering::Relaxed);
    }

    #[test]
    fn set_idle_timeout_rejects_zero() {
        IDLE_TIMEOUT_SECS.store(DEFAULT_IDLE_TIMEOUT_SECS, Ordering::Relaxed);
        let result = set_idle_timeout_secs(0);
        assert_eq!(result, 8);
        assert_eq!(get_idle_timeout_secs(), 8);
    }

    #[test]
    fn set_idle_timeout_clamps_to_max() {
        IDLE_TIMEOUT_SECS.store(DEFAULT_IDLE_TIMEOUT_SECS, Ordering::Relaxed);
        let result = set_idle_timeout_secs(300);
        assert_eq!(result, 120);
        assert_eq!(get_idle_timeout_secs(), 120);
        IDLE_TIMEOUT_SECS.store(DEFAULT_IDLE_TIMEOUT_SECS, Ordering::Relaxed);
    }

    #[test]
    fn idle_timeout_duration_reflects_atomic() {
        IDLE_TIMEOUT_SECS.store(DEFAULT_IDLE_TIMEOUT_SECS, Ordering::Relaxed);
        set_idle_timeout_secs(20);
        assert_eq!(idle_timeout(), Duration::from_secs(20));
        IDLE_TIMEOUT_SECS.store(DEFAULT_IDLE_TIMEOUT_SECS, Ordering::Relaxed);
    }
}
