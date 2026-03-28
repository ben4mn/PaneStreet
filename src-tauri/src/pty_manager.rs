use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::ipc::Channel;

use crate::status_detector;

struct PtyHandle {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

static PTY_MAP: std::sync::LazyLock<Mutex<HashMap<String, PtyHandle>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Serialize)]
pub struct PtyOutput {
    data: Vec<u8>,
}

#[tauri::command]
pub fn spawn_pty(
    app: tauri::AppHandle,
    rows: u16,
    cols: u16,
    cwd: Option<String>,
    session_id: Option<String>,
    on_data: Channel<PtyOutput>,
) -> Result<String, String> {
    // Initialize status detector with app handle (idempotent)
    status_detector::init(&app);

    let pty_system = native_pty_system();

    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = pty_system
        .openpty(size)
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // Determine the user's shell
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l"); // Login shell for proper env
    cmd.env("TERM", "xterm-256color");

    if let Some(dir) = cwd {
        cmd.cwd(dir);
    } else {
        // Default to home directory
        if let Some(home) = dirs::home_dir() {
            cmd.cwd(home);
        }
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // Drop the slave — we only need the master side
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

    let session_id = session_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let sid = session_id.clone();
    let sid_for_thread = sid.clone();

    // Register session for status tracking
    status_detector::register_session(&sid);

    // Spawn a dedicated OS thread for the blocking PTY read loop
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF — process exited
                Ok(n) => {
                    let data = buf[..n].to_vec();

                    // Status detection on each chunk
                    if let Some(new_status) = status_detector::on_output(&sid_for_thread, &data) {
                        status_detector::emit_status(
                            &sid_for_thread,
                            new_status.as_str(),
                            None,
                        );
                    }

                    if on_data.send(PtyOutput { data }).is_err() {
                        break; // Channel closed
                    }
                }
                Err(_) => break,
            }
        }

        // PTY read loop exited — process finished
        status_detector::on_exit(&sid_for_thread, 0);
    });

    let handle = PtyHandle {
        writer,
        master: pair.master,
        child,
    };

    PTY_MAP
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?
        .insert(sid.clone(), handle);

    Ok(sid)
}

#[tauri::command]
pub fn write_to_pty(session_id: String, data: Vec<u8>) -> Result<(), String> {
    let mut map = PTY_MAP
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let handle = map
        .get_mut(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    handle
        .writer
        .write_all(&data)
        .map_err(|e| format!("Write error: {}", e))?;

    handle
        .writer
        .flush()
        .map_err(|e| format!("Flush error: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn resize_pty(session_id: String, rows: u16, cols: u16) -> Result<(), String> {
    let map = PTY_MAP
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let handle = map
        .get(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    handle
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Resize error: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn kill_pty(session_id: String) -> Result<(), String> {
    let mut map = PTY_MAP
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    if let Some(mut handle) = map.remove(&session_id) {
        let _ = handle.child.kill();
    }

    status_detector::unregister_session(&session_id);

    Ok(())
}
