use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize)]
pub struct PluginInfo {
    pub name: String,
    pub enabled: bool,
    pub version: String,
    pub scope: String,
}

#[derive(Clone, Serialize)]
pub struct McpServerEntry {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Clone, Serialize)]
pub struct ClaudeConfigSnapshot {
    pub settings_raw: Value,
    pub plugins: Vec<PluginInfo>,
    pub mcp_servers: Vec<McpServerEntry>,
    pub global_memory: Option<String>,
    pub project_memory: Option<String>,
    pub companion_name: Option<String>,
}

fn claude_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude"))
}

fn encode_project_path(path: &str) -> String {
    path.replace('/', "-")
}

fn read_json_file(path: &Path) -> Option<Value> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

#[tauri::command]
pub fn read_claude_config(project_path: Option<String>) -> Result<ClaudeConfigSnapshot, String> {
    let claude = claude_dir().ok_or("Could not find home directory")?;

    // Read settings.json
    let settings_path = claude.join("settings.json");
    let settings_raw = read_json_file(&settings_path).unwrap_or(Value::Object(Default::default()));

    // Extract enabled plugins from settings
    let enabled_plugins: HashMap<String, bool> = settings_raw
        .get("enabledPlugins")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // Read installed_plugins.json
    let plugins_path = claude.join("plugins").join("installed_plugins.json");
    let plugins_raw = read_json_file(&plugins_path);

    let mut plugins = Vec::new();
    if let Some(raw) = plugins_raw {
        if let Some(plugins_map) = raw.get("plugins").and_then(|v| v.as_object()) {
            for (name, installs) in plugins_map {
                let install = installs
                    .as_array()
                    .and_then(|arr| arr.first());

                let version = install
                    .and_then(|i| i.get("version"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                let scope = install
                    .and_then(|i| i.get("scope"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("user")
                    .to_string();

                let enabled = enabled_plugins.get(name).copied().unwrap_or(false);

                plugins.push(PluginInfo {
                    name: name.clone(),
                    enabled,
                    version,
                    scope,
                });
            }
        }
    }

    // Extract MCP servers from settings.json and ~/.claude.json
    let mut mcp_servers = Vec::new();
    let mut seen_names = std::collections::HashSet::new();

    // Check both sources for mcpServers
    let home = dirs::home_dir();
    let claude_json_raw = home.as_ref()
        .and_then(|h| read_json_file(&h.join(".claude.json")));

    let mcp_sources: Vec<&Value> = [
        Some(&settings_raw),
        claude_json_raw.as_ref(),
    ].into_iter().flatten().collect();

    for source in mcp_sources {
        if let Some(servers) = source.get("mcpServers").and_then(|v| v.as_object()) {
            for (name, config) in servers {
                if seen_names.contains(name) { continue; }
                seen_names.insert(name.clone());

                let command = config
                    .get("command")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let args = config
                    .get("args")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();

                mcp_servers.push(McpServerEntry {
                    name: name.clone(),
                    command,
                    args,
                });
            }
        }
    }

    // Read global CLAUDE.md
    let global_memory = std::fs::read_to_string(claude.join("CLAUDE.md")).ok();

    // Read project-level CLAUDE.md
    let project_memory = project_path.and_then(|path| {
        let encoded = encode_project_path(&path);
        // Check project's own CLAUDE.md
        let project_claude = Path::new(&path).join("CLAUDE.md");
        if project_claude.exists() {
            return std::fs::read_to_string(project_claude).ok();
        }
        // Check .claude/CLAUDE.md in project
        let dot_claude = Path::new(&path).join(".claude").join("CLAUDE.md");
        if dot_claude.exists() {
            return std::fs::read_to_string(dot_claude).ok();
        }
        // Check in ~/.claude/projects/
        let projects_dir = claude.join("projects").join(&encoded);
        let memory_dir = projects_dir.join("memory");
        if memory_dir.exists() {
            // Read MEMORY.md index if it exists
            return std::fs::read_to_string(memory_dir.join("MEMORY.md")).ok();
        }
        None
    });

    // Extract companion name from ~/.claude.json
    let companion_name = claude_json_raw.as_ref()
        .and_then(|v| v.get("companion"))
        .and_then(|v| v.get("name"))
        .and_then(|v| v.as_str())
        .map(String::from);

    Ok(ClaudeConfigSnapshot {
        settings_raw,
        plugins,
        mcp_servers,
        global_memory,
        project_memory,
        companion_name,
    })
}

#[tauri::command]
pub fn save_claude_settings(settings_json: String) -> Result<(), String> {
    // Validate it's valid JSON first
    let _: Value =
        serde_json::from_str(&settings_json).map_err(|e| format!("Invalid JSON: {}", e))?;

    let claude = claude_dir().ok_or("Could not find home directory")?;
    let settings_path = claude.join("settings.json");

    std::fs::write(&settings_path, &settings_json)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn read_memory_file(path: String) -> Result<Option<String>, String> {
    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(Some(content)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

#[tauri::command]
pub fn save_memory_file(path: String, content: String) -> Result<(), String> {
    // Create parent directories if needed
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    std::fs::write(&path, &content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

// --- Project Memories ---

#[derive(Clone, Serialize)]
pub struct MemoryFile {
    pub name: String,
    pub path: String,
    pub content: String,
}

#[derive(Clone, Serialize)]
pub struct ProjectMemories {
    pub project_path: String,
    pub project_name: String,
    pub claude_md: Option<String>,
    pub claude_md_path: Option<String>,
    pub memory_index: Option<String>,
    pub memory_files: Vec<MemoryFile>,
    pub global_claude_md: Option<String>,
}

#[tauri::command]
pub fn read_project_memories(project_path: String) -> Result<ProjectMemories, String> {
    let claude = claude_dir().ok_or("Could not find home directory")?;
    let project = Path::new(&project_path);

    let project_name = project
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // Read global CLAUDE.md
    let global_claude_md = std::fs::read_to_string(claude.join("CLAUDE.md")).ok();

    // Find project CLAUDE.md (check multiple locations)
    let (claude_md, claude_md_path) = {
        let p1 = project.join("CLAUDE.md");
        let p2 = project.join(".claude").join("CLAUDE.md");
        if p1.exists() {
            (std::fs::read_to_string(&p1).ok(), Some(p1.to_string_lossy().to_string()))
        } else if p2.exists() {
            (std::fs::read_to_string(&p2).ok(), Some(p2.to_string_lossy().to_string()))
        } else {
            (None, None)
        }
    };

    // Read memory files from ~/.claude/projects/<encoded>/memory/
    let encoded = encode_project_path(&project_path);
    let memory_dir = claude.join("projects").join(&encoded).join("memory");

    let memory_index = if memory_dir.join("MEMORY.md").exists() {
        std::fs::read_to_string(memory_dir.join("MEMORY.md")).ok()
    } else {
        None
    };

    let mut memory_files = Vec::new();
    if memory_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&memory_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name == "MEMORY.md" {
                    continue; // Already read as index
                }
                let path = entry.path();
                if path.is_file() {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        memory_files.push(MemoryFile {
                            name,
                            path: path.to_string_lossy().to_string(),
                            content,
                        });
                    }
                }
            }
        }
    }

    memory_files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(ProjectMemories {
        project_path,
        project_name,
        claude_md,
        claude_md_path,
        memory_index,
        memory_files,
        global_claude_md,
    })
}

// --- Claude Scheduled Tasks & Sessions ---

#[derive(Clone, Serialize)]
pub struct ClaudeSession {
    pub pid: u64,
    pub session_id: String,
    pub cwd: String,
    pub started_at: i64,
    pub kind: String,
    pub entrypoint: String,
    pub name: Option<String>,
    pub alive: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ScheduledTask {
    pub id: Option<String>,
    pub cron: Option<String>,
    pub prompt: Option<String>,
    pub recurring: Option<bool>,
    pub created_at: Option<i64>,
    pub last_run: Option<i64>,
    pub name: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct ScheduledOverview {
    pub sessions: Vec<ClaudeSession>,
    pub scheduled_tasks: Vec<ScheduledTask>,
}

fn is_pid_alive(pid: u64) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

#[tauri::command]
pub fn read_scheduled_tasks() -> Result<ScheduledOverview, String> {
    let claude = claude_dir().ok_or("Could not find home directory")?;

    // Read active sessions from ~/.claude/sessions/*.json
    let mut sessions = Vec::new();
    let sessions_dir = claude.join("sessions");
    if sessions_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&sessions_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(val) = serde_json::from_str::<Value>(&content) {
                            let pid = val.get("pid").and_then(|v| v.as_u64()).unwrap_or(0);
                            let alive = if pid > 0 { is_pid_alive(pid) } else { false };

                            sessions.push(ClaudeSession {
                                pid,
                                session_id: val
                                    .get("sessionId")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                cwd: val
                                    .get("cwd")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                started_at: val
                                    .get("startedAt")
                                    .and_then(|v| v.as_i64())
                                    .unwrap_or(0),
                                kind: val
                                    .get("kind")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                entrypoint: val
                                    .get("entrypoint")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                name: val
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .map(String::from),
                                alive,
                            });
                        }
                    }
                }
            }
        }
    }

    // Sort: alive first, then by started_at descending
    sessions.sort_by(|a, b| {
        b.alive
            .cmp(&a.alive)
            .then(b.started_at.cmp(&a.started_at))
    });

    // Read scheduled tasks from ~/.claude/scheduled_tasks.json if it exists
    let mut scheduled_tasks = Vec::new();
    let tasks_path = claude.join("scheduled_tasks.json");
    if tasks_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&tasks_path) {
            // Try parsing as array first, then as object with a tasks field
            if let Ok(tasks) = serde_json::from_str::<Vec<ScheduledTask>>(&content) {
                scheduled_tasks = tasks;
            } else if let Ok(val) = serde_json::from_str::<Value>(&content) {
                if let Some(arr) = val.get("tasks").and_then(|v| v.as_array()) {
                    for item in arr {
                        if let Ok(task) = serde_json::from_value::<ScheduledTask>(item.clone()) {
                            scheduled_tasks.push(task);
                        }
                    }
                }
            }
        }
    }

    Ok(ScheduledOverview {
        sessions,
        scheduled_tasks,
    })
}

// --- Claude Code Hooks ---

const HOOK_MARKER: &str = "# PaneStreet hook";

fn pane_street_hooks_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".pane-street").join("hooks"))
}

fn notify_script_path() -> Option<PathBuf> {
    pane_street_hooks_dir().map(|d| d.join("notify.sh"))
}

pub fn build_notify_script(sock_path: &Path, log_path: &Path) -> String {
    // Pass paths via environment variables so they cannot interact with Python's
    // source-level quoting. The Python body reads them with os.environ.
    format!(
        r#"#!/bin/bash
{marker}
# Sends Claude Code hook events to PaneStreet via Unix socket.
# Only fires for sessions running inside PaneStreet (PANESTREET=1 env var).
# Usage: notify.sh <EventName>   (event name passed as $1 from hook config)
[ -z "$PANESTREET" ] && cat > /dev/null && exit 0
EVENT_NAME="${{1:-unknown}}"
INPUT=$(cat)
export PS_SOCK={sock_env}
export PS_LOG={log_env}
# Use python3 for robust JSON parsing (handles escaped quotes, newlines, unicode)
python3 -c '
import json, os, sys, socket, time
event_name = sys.argv[2]
sock_path = os.environ.get("PS_SOCK", "")
log_path = os.environ.get("PS_LOG", "")
def log_err(reason):
    try:
        if not log_path:
            return
        # Rotate if > 1 MB
        try:
            if os.path.getsize(log_path) > 1_048_576:
                os.rename(log_path, log_path + ".1")
        except OSError:
            pass
        ts = time.strftime("%Y-%m-%dT%H:%M:%S")
        with open(log_path, "a") as f:
            f.write(ts + " event=" + str(event_name) + " " + str(reason) + "\n")
    except Exception:
        pass
try:
    d = json.loads(sys.argv[1])
except Exception as e:
    log_err("parse-error: " + str(e))
    sys.exit(0)
def g(k, maxlen=0):
    v = str(d.get(k, ""))
    return v[:maxlen] if maxlen else v
payload = json.dumps({{
    "cmd": "hook-event",
    "event": event_name or g("hook_event_name") or "unknown",
    "tool": g("tool_name"),
    "message": g("message"),
    "title": g("title"),
    "ntype": g("notification_type"),
    "last_msg": g("last_assistant_message", 200),
    "session": g("session_id"),
}})
try:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(1)
    s.connect(sock_path)
    s.sendall((payload + "\n").encode())
    s.close()
except Exception as e:
    log_err("socket-error: " + str(e))
' "$INPUT" "$EVENT_NAME"
"#,
        marker = HOOK_MARKER,
        sock_env = shell_quote(&sock_path.to_string_lossy()),
        log_env = shell_quote(&log_path.to_string_lossy()),
    )
}

fn shell_quote(s: &str) -> String {
    // POSIX-safe: wrap in single quotes, escape internal single quotes as '\''
    let mut out = String::with_capacity(s.len() + 2);
    out.push('\'');
    for ch in s.chars() {
        if ch == '\'' {
            out.push_str("'\\''");
        } else {
            out.push(ch);
        }
    }
    out.push('\'');
    out
}

fn ensure_notify_script() -> Result<String, String> {
    let dir = pane_street_hooks_dir().ok_or("Could not find home directory")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create hooks dir: {}", e))?;

    let script_path = dir.join("notify.sh");
    let sock_path = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".pane-street")
        .join("panestreet.sock");
    let log_path = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".pane-street")
        .join("hooks.log");

    let script = build_notify_script(&sock_path, &log_path);

    std::fs::write(&script_path, &script)
        .map_err(|e| format!("Failed to write notify script: {}", e))?;

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o755));
    }

    Ok(script_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn install_claude_hooks() -> Result<bool, String> {
    let script_path = ensure_notify_script()?;

    let claude = claude_dir().ok_or("Could not find home directory")?;
    let settings_path = claude.join("settings.json");
    let mut settings: serde_json::Map<String, Value> = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };

    let hooks = settings.entry("hooks".to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let hooks_obj = hooks.as_object_mut().ok_or("hooks is not an object")?;

    // Install hooks for key events, preserving existing hooks
    // Each event gets the event name passed as $1 so the script doesn't rely on JSON payload
    for event_name in &["Notification", "Stop", "SubagentStop"] {
        let ps_hook_entry = serde_json::json!({
            "matcher": "",
            "hooks": [{
                "type": "command",
                "command": format!("bash {} {}", script_path, event_name),
            }]
        });

        let arr = hooks_obj.entry(event_name.to_string())
            .or_insert_with(|| Value::Array(Vec::new()));
        if let Some(arr) = arr.as_array_mut() {
            // Remove existing PaneStreet hooks first
            arr.retain(|h| {
                // Match by command containing pane-street
                let is_ps = h.get("hooks")
                    .and_then(|hs| hs.as_array())
                    .map(|hs| hs.iter().any(|hook| {
                        hook.get("command").and_then(|c| c.as_str())
                            .map(|c| c.contains("pane-street"))
                            .unwrap_or(false)
                    }))
                    .unwrap_or(false);
                !is_ps
            });
            arr.push(ps_hook_entry);
        }
    }

    let json_str = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(&settings_path, &json_str)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub fn uninstall_claude_hooks() -> Result<bool, String> {
    let claude = claude_dir().ok_or("Could not find home directory")?;
    let settings_path = claude.join("settings.json");

    if !settings_path.exists() {
        return Ok(false);
    }

    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;
    let mut settings: serde_json::Map<String, Value> =
        serde_json::from_str(&content).unwrap_or_default();

    if let Some(hooks) = settings.get_mut("hooks").and_then(|h| h.as_object_mut()) {
        for (_event_name, arr) in hooks.iter_mut() {
            if let Some(arr) = arr.as_array_mut() {
                arr.retain(|h| {
                    let is_ps = h.get("hooks")
                        .and_then(|hs| hs.as_array())
                        .map(|hs| hs.iter().any(|hook| {
                            hook.get("command").and_then(|c| c.as_str())
                                .map(|c| c.contains("pane-street"))
                                .unwrap_or(false)
                        }))
                        .unwrap_or(false);
                    !is_ps
                });
            }
        }
    }

    let json_str = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(&settings_path, &json_str)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    // Clean up notify script
    if let Some(script) = notify_script_path() {
        let _ = std::fs::remove_file(script);
    }

    Ok(true)
}

#[tauri::command]
pub fn check_hooks_installed() -> Result<bool, String> {
    let claude = claude_dir().ok_or("Could not find home directory")?;
    let settings_path = claude.join("settings.json");

    if !settings_path.exists() {
        return Ok(false);
    }

    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;
    let settings: Value = serde_json::from_str(&content).unwrap_or_default();

    let installed = settings.get("hooks")
        .and_then(|h| h.as_object())
        .map(|hooks| {
            hooks.values().any(|arr| {
                arr.as_array().map(|a| {
                    a.iter().any(|entry| {
                        entry.get("hooks")
                            .and_then(|hs| hs.as_array())
                            .map(|hs| hs.iter().any(|hook| {
                                hook.get("command").and_then(|c| c.as_str())
                                    .map(|c| c.contains("pane-street"))
                                    .unwrap_or(false)
                            }))
                            .unwrap_or(false)
                    })
                }).unwrap_or(false)
            })
        })
        .unwrap_or(false);

    Ok(installed)
}

// --- Session Persistence ---

fn pane_street_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".pane-street"))
}

pub fn save_sessions_to(path: &Path, json: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("Failed to write sessions: {}", e))?;
    std::fs::rename(&tmp, path)
        .map_err(|e| format!("Failed to finalize sessions: {}", e))?;
    // After a successful write, mirror the freshly-written good file to .bak so
    // the next load_sessions_from can recover this version if the primary is later corrupted.
    let bak = path.with_extension("json.bak");
    let _ = std::fs::copy(path, &bak);
    Ok(())
}

#[tauri::command]
pub fn save_sessions(json: String) -> Result<(), String> {
    let dir = pane_street_dir().ok_or("Could not find home directory")?;
    save_sessions_to(&dir.join("sessions.json"), &json)
}

pub fn load_sessions_from(path: &Path) -> Result<Option<String>, String> {
    let read_valid = |p: &Path| -> Option<String> {
        let contents = std::fs::read_to_string(p).ok()?;
        serde_json::from_str::<serde_json::Value>(&contents).ok()?;
        Some(contents)
    };

    if let Some(good) = read_valid(path) {
        return Ok(Some(good));
    }

    // Primary is missing or corrupt — try the backup
    let bak = path.with_extension("json.bak");
    if path.exists() {
        // Move the bad primary aside so next save won't overwrite forensic evidence
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let corrupt_path = path.with_extension(format!("json.corrupt-{}", ts));
        let _ = std::fs::rename(path, &corrupt_path);
    }

    if let Some(backup) = read_valid(&bak) {
        return Ok(Some(backup));
    }

    Ok(None)
}

#[tauri::command]
pub fn load_sessions() -> Result<Option<String>, String> {
    let path = pane_street_dir()
        .ok_or("Could not find home directory")?
        .join("sessions.json");
    load_sessions_from(&path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn extract_python_body(script: &str) -> String {
        // The python3 body lives between python3 -c '...' single quotes.
        let start = script.find("python3 -c '").expect("python3 -c block");
        let after = &script[start + "python3 -c '".len()..];
        // Find matching close quote at end (since we only embed shell-safe content inside)
        let end = after.find("\n' \"$INPUT\"").expect("end of python body");
        after[..end].to_string()
    }

    fn python_compiles(body: &str) -> bool {
        // Write body to a temp file and ask python3 to syntax-check it via py_compile.
        // This avoids a quoting hop that would mask real escape issues in `body`.
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir();
        let path = dir.join(format!("ps_hook_test_{}_{}.py", std::process::id(), n));
        std::fs::write(&path, body).expect("write temp py");
        let out = Command::new("python3")
            .args(["-m", "py_compile"])
            .arg(&path)
            .output()
            .expect("python3 available");
        let _ = std::fs::remove_file(&path);
        if !out.status.success() {
            eprintln!(
                "python stderr:\n{}",
                String::from_utf8_lossy(&out.stderr)
            );
        }
        out.status.success()
    }

    #[test]
    fn notify_script_compiles_with_plain_path() {
        let sock = PathBuf::from("/tmp/panestreet.sock");
        let log = PathBuf::from("/tmp/hooks.log");
        let script = build_notify_script(&sock, &log);
        let body = extract_python_body(&script);
        assert!(python_compiles(&body), "plain path python body failed to compile");
    }

    #[test]
    fn notify_script_compiles_with_single_quote_in_path() {
        let sock = PathBuf::from("/tmp/it's-me/panestreet.sock");
        let log = PathBuf::from("/tmp/it's-me/hooks.log");
        let script = build_notify_script(&sock, &log);
        let body = extract_python_body(&script);
        assert!(
            python_compiles(&body),
            "python body with single-quote in path failed to compile:\n{}",
            body
        );
    }

    #[test]
    fn notify_script_compiles_with_backslash_in_path() {
        let sock = PathBuf::from("/tmp/weird\\path/panestreet.sock");
        let log = PathBuf::from("/tmp/weird\\path/hooks.log");
        let script = build_notify_script(&sock, &log);
        let body = extract_python_body(&script);
        assert!(
            python_compiles(&body),
            "python body with backslash in path failed to compile:\n{}",
            body
        );
    }

    #[test]
    fn shell_quote_wraps_plain_path() {
        assert_eq!(shell_quote("/tmp/x.sock"), "'/tmp/x.sock'");
    }

    #[test]
    fn shell_quote_escapes_single_quote() {
        assert_eq!(shell_quote("it's"), r#"'it'\''s'"#);
    }

    #[test]
    fn load_sessions_from_returns_primary_when_valid() {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ps_load_good_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sessions.json");
        std::fs::write(&path, r#"{"version":3}"#).unwrap();

        let result = load_sessions_from(&path).unwrap();
        assert_eq!(result.as_deref(), Some(r#"{"version":3}"#));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_sessions_from_falls_back_to_backup_when_corrupt() {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ps_load_corrupt_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sessions.json");
        let bak = dir.join("sessions.json.bak");
        std::fs::write(&path, "this is not json {{").unwrap();
        std::fs::write(&bak, r#"{"version":3,"recovered":true}"#).unwrap();

        let result = load_sessions_from(&path).unwrap();
        assert_eq!(
            result.as_deref(),
            Some(r#"{"version":3,"recovered":true}"#),
            "expected backup contents when primary is corrupt"
        );

        // Bad file should be moved aside so next save does not overwrite evidence
        assert!(!path.exists(), "corrupt primary should have been moved aside");
        let moved: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with("sessions.json.corrupt-"))
            .collect();
        assert_eq!(moved.len(), 1, "expected exactly one .corrupt-<ts> artifact");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_sessions_from_returns_none_when_nothing_exists() {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ps_load_empty_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sessions.json");

        let result = load_sessions_from(&path).unwrap();
        assert!(result.is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_then_load_round_trips_via_backup_on_corruption() {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ps_load_rt_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sessions.json");

        // First save: creates primary, no .bak yet
        save_sessions_to(&path, r#"{"version":3,"first":true}"#).unwrap();
        // Second save: should move first version to .bak before writing
        save_sessions_to(&path, r#"{"version":3,"second":true}"#).unwrap();
        // Corrupt the primary
        std::fs::write(&path, "garbage").unwrap();

        let loaded = load_sessions_from(&path).unwrap().unwrap();
        // We should recover the "second" save (the most recent good one)
        assert!(loaded.contains("second"), "expected second save recovered from .bak, got {}", loaded);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cargo_toml_declares_window_state_plugin() {
        // CARGO_MANIFEST_DIR points at src-tauri/ when running cargo test.
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        let contents = std::fs::read_to_string(&manifest).expect("read Cargo.toml");
        assert!(
            contents.contains("tauri-plugin-window-state"),
            "Cargo.toml must declare tauri-plugin-window-state; found:\n{}",
            contents
        );
    }

    #[test]
    fn lib_rs_registers_window_state_plugin() {
        let lib = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/lib.rs");
        let contents = std::fs::read_to_string(&lib).expect("read lib.rs");
        assert!(
            contents.contains("tauri_plugin_window_state::Builder"),
            "lib.rs must register tauri_plugin_window_state; got:\n{}",
            contents
        );
    }

    #[test]
    fn save_sessions_is_atomic_under_concurrency() {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ps_atomic_save_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sessions.json");

        // Writer: alternates between two valid JSON payloads quickly
        let path_w = path.clone();
        let writer = std::thread::spawn(move || {
            let payloads = [
                r#"{"version":3,"sessions":[{"name":"a"}]}"#,
                r#"{"version":3,"sessions":[{"name":"b"},{"name":"c"}]}"#,
            ];
            for i in 0..300 {
                save_sessions_to(&path_w, payloads[i % 2]).unwrap();
            }
        });

        // Reader: every read must parse as JSON (never empty, never truncated)
        let path_r = path.clone();
        let reader = std::thread::spawn(move || {
            for _ in 0..800 {
                if let Ok(s) = std::fs::read_to_string(&path_r) {
                    assert!(!s.is_empty(), "sessions.json must never be empty when present");
                    serde_json::from_str::<serde_json::Value>(&s)
                        .expect("sessions.json must always be valid JSON under concurrency");
                }
            }
        });

        writer.join().unwrap();
        reader.join().unwrap();

        let tmp = dir.join("sessions.json.tmp");
        assert!(!tmp.exists(), "tmp artifact should not linger after writes");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn hook_script_logs_socket_error_when_sock_missing() {
        // Arrange: a scratch dir with a bogus sock path and empty log file
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let tmp = std::env::temp_dir().join(format!("ps_hook_e2e_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&tmp).unwrap();
        let sock = tmp.join("nonexistent.sock");
        let log = tmp.join("hooks.log");
        let script_path = tmp.join("notify.sh");
        let script = build_notify_script(&sock, &log);
        std::fs::write(&script_path, &script).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }

        // Act: run the script with PANESTREET=1 and a valid JSON payload
        let status = Command::new("bash")
            .arg(&script_path)
            .arg("Notification")
            .env("PANESTREET", "1")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .and_then(|mut child| {
                use std::io::Write;
                child
                    .stdin
                    .as_mut()
                    .unwrap()
                    .write_all(br#"{"hook_event_name":"Notification","title":"t","message":"m"}"#)
                    .unwrap();
                child.wait()
            })
            .expect("run notify.sh");

        // Assert: script exited cleanly AND log captured the socket error
        assert!(status.success(), "notify script should exit 0 even on error");
        let log_contents = std::fs::read_to_string(&log).unwrap_or_default();
        assert!(
            log_contents.contains("socket-error"),
            "expected 'socket-error' in log, got: {:?}",
            log_contents
        );
        assert!(
            log_contents.contains("event=Notification"),
            "expected event name in log, got: {:?}",
            log_contents
        );

        // Cleanup
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
