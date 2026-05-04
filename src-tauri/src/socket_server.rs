use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixListener;

use crate::pty_manager;

#[derive(Debug, Deserialize, Serialize)]
#[allow(dead_code)]
struct SocketCommand {
    cmd: String,
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    data: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    event: Option<String>,
    #[serde(default)]
    tool: Option<String>,
    #[serde(default)]
    reason: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    ntype: Option<String>,
    #[serde(default)]
    last_msg: Option<String>,
    #[serde(default)]
    session: Option<String>,
}

#[derive(Serialize)]
struct SocketResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn socket_path() -> PathBuf {
    let dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".pane-street");
    std::fs::create_dir_all(&dir).ok();
    dir.join("panestreet.sock")
}

pub fn start(app_handle: tauri::AppHandle) {
    let path = socket_path();

    // Distinguish stale socket from live instance — refuse to stomp a live peer
    if let Err(e) = prepare_socket(&path) {
        eprintln!("[socket_server] {}", e);
        return;
    }

    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime for socket server");

        rt.block_on(async move {
            let listener = match UnixListener::bind(&path) {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("[socket_server] Failed to bind {}: {}", path.display(), e);
                    return;
                }
            };

            // Make socket accessible
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700));
            }

            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        let app = app_handle.clone();
                        tokio::spawn(async move {
                            handle_connection(stream, app).await;
                        });
                    }
                    Err(e) => {
                        eprintln!("[socket_server] Accept error: {}", e);
                    }
                }
            }
        });
    });
}

async fn handle_connection(stream: tokio::net::UnixStream, app: tauri::AppHandle) {
    let (reader, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let mut line = String::new();

    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => break, // Connection closed
            Ok(_) => {
                let response = process_command(line.trim(), &app);
                let json = serde_json::to_string(&response).unwrap_or_else(|_| {
                    r#"{"ok":false,"error":"serialize error"}"#.to_string()
                });
                let _ = writer.write_all(json.as_bytes()).await;
                let _ = writer.write_all(b"\n").await;
                let _ = writer.flush().await;
            }
            Err(_) => break,
        }
    }
}

fn process_command(input: &str, app: &tauri::AppHandle) -> SocketResponse {
    let cmd: SocketCommand = match serde_json::from_str(input) {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit(
                "socket-parse-error",
                serde_json::json!({
                    "error": format!("Invalid JSON: {}", e),
                    "input": &input[..input.len().min(200)],
                }),
            );
            return SocketResponse {
                ok: false,
                data: None,
                error: Some(format!("Invalid JSON: {}", e)),
            }
        }
    };

    match cmd.cmd.as_str() {
        "ping" => SocketResponse {
            ok: true,
            data: Some(serde_json::json!("pong")),
            error: None,
        },

        "list-sessions" => {
            let sessions = pty_manager::list_sessions();
            SocketResponse {
                ok: true,
                data: Some(serde_json::json!(sessions)),
                error: None,
            }
        }

        "write" => {
            let session_id = match cmd.session_id {
                Some(id) => id,
                None => {
                    return SocketResponse {
                        ok: false,
                        data: None,
                        error: Some("session_id required".to_string()),
                    }
                }
            };
            let data = cmd.data.unwrap_or_default();
            match pty_manager::write_to_pty(session_id, data.into_bytes()) {
                Ok(_) => SocketResponse {
                    ok: true,
                    data: None,
                    error: None,
                },
                Err(e) => SocketResponse {
                    ok: false,
                    data: None,
                    error: Some(e),
                },
            }
        }

        "get-status" => {
            let session_id = match cmd.session_id {
                Some(id) => id,
                None => {
                    return SocketResponse {
                        ok: false,
                        data: None,
                        error: Some("session_id required".to_string()),
                    }
                }
            };
            let status = crate::status_detector::get_status(&session_id);
            SocketResponse {
                ok: true,
                data: Some(serde_json::json!({ "status": status })),
                error: None,
            }
        }

        "notify" => {
            let title = cmd.title.unwrap_or_else(|| "PaneStreet".to_string());
            let body = cmd.body.unwrap_or_default();
            // Emit a Tauri event that the frontend can listen for
            let _ = app.emit(
                "socket-notification",
                serde_json::json!({ "title": title, "body": body }),
            );
            SocketResponse {
                ok: true,
                data: None,
                error: None,
            }
        }

        "focus" => {
            let session_id = match cmd.session_id {
                Some(id) => id,
                None => {
                    return SocketResponse {
                        ok: false,
                        data: None,
                        error: Some("session_id required".to_string()),
                    }
                }
            };
            let _ = app.emit(
                "socket-focus",
                serde_json::json!({ "session_id": session_id }),
            );
            SocketResponse {
                ok: true,
                data: None,
                error: None,
            }
        }

        "hook-event" => {
            let _ = app.emit(
                "claude-hook-event",
                serde_json::json!({
                    "event": cmd.event.unwrap_or_default(),
                    "tool": cmd.tool.unwrap_or_default(),
                    "message": cmd.message.unwrap_or_default(),
                    "title": cmd.title.unwrap_or_default(),
                    "ntype": cmd.ntype.unwrap_or_default(),
                    "last_msg": cmd.last_msg.unwrap_or_default(),
                    "session": cmd.session.unwrap_or_default(),
                }),
            );
            SocketResponse {
                ok: true,
                data: None,
                error: None,
            }
        }

        _ => SocketResponse {
            ok: false,
            data: None,
            error: Some(format!("Unknown command: {}", cmd.cmd)),
        },
    }
}

fn http_hook_port_path() -> PathBuf {
    let dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".pane-street");
    std::fs::create_dir_all(&dir).ok();
    dir.join("http-hook-port")
}

pub fn parse_hook_http_body(body: &str) -> Result<SocketCommand, String> {
    serde_json::from_str(body).map_err(|e| format!("Invalid JSON: {}", e))
}

pub fn build_hook_http_response(ok: bool, error: Option<&str>) -> String {
    let status = if ok { "200 OK" } else { "400 Bad Request" };
    let body = if ok {
        r#"{"ok":true}"#.to_string()
    } else {
        format!(r#"{{"ok":false,"error":"{}"}}"#, error.unwrap_or("unknown"))
    };
    format!(
        "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        body.len(),
        body
    )
}

pub fn start_http(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime for HTTP hook server");

        rt.block_on(async move {
            let listener = match tokio::net::TcpListener::bind("127.0.0.1:0").await {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("[http_hook] Failed to bind: {}", e);
                    return;
                }
            };

            let port = match listener.local_addr() {
                Ok(addr) => addr.port(),
                Err(e) => {
                    eprintln!("[http_hook] Failed to get local addr: {}", e);
                    return;
                }
            };

            let port_file = http_hook_port_path();
            if let Err(e) = write_port_file_atomic(&port_file, port) {
                eprintln!("[http_hook] Failed to write port file: {}", e);
            }

            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        let app = app_handle.clone();
                        tokio::spawn(async move {
                            handle_http_connection(stream, app).await;
                        });
                    }
                    Err(e) => {
                        eprintln!("[http_hook] Accept error: {}", e);
                    }
                }
            }
        });
    });
}

pub fn prepare_socket(path: &std::path::Path) -> Result<(), String> {
    use std::os::unix::net::UnixStream as StdUnixStream;
    if !path.exists() {
        return Ok(());
    }
    // If a live listener is accepting connections, another instance is running.
    match StdUnixStream::connect(path) {
        Ok(_) => Err(format!(
            "Another pane-street instance appears to be running (socket {} is live)",
            path.display()
        )),
        Err(_) => {
            // Stale file — safe to remove and proceed
            std::fs::remove_file(path)
                .map_err(|e| format!("Failed to remove stale socket {}: {}", path.display(), e))?;
            Ok(())
        }
    }
}

pub fn write_port_file_atomic(path: &std::path::Path, port: u16) -> std::io::Result<()> {
    let tmp = path.with_extension("port.tmp");
    std::fs::write(&tmp, port.to_string())?;
    std::fs::rename(&tmp, path)
}

pub fn extract_http_body(request: &str) -> &str {
    // Prefer CRLF+CRLF; fall back to LF+LF for non-spec-compliant clients.
    if let Some(i) = request.find("\r\n\r\n") {
        return &request[i + 4..];
    }
    if let Some(i) = request.find("\n\n") {
        return &request[i + 2..];
    }
    ""
}

async fn handle_http_connection(mut stream: tokio::net::TcpStream, app: tauri::AppHandle) {
    let mut buf = vec![0u8; 8192];
    let n = match stream.read(&mut buf).await {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let request = String::from_utf8_lossy(&buf[..n]);

    // Extract body: everything after the blank line
    let body = extract_http_body(&request);

    let response = match parse_hook_http_body(body) {
        Ok(_cmd) => {
            let result = process_command(body, &app);
            let ok = result.ok;
            let json = serde_json::to_string(&result).unwrap_or_else(|_| {
                r#"{"ok":false,"error":"serialize error"}"#.to_string()
            });
            let status = if ok { "200 OK" } else { "400 Bad Request" };
            format!(
                "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                status,
                json.len(),
                json
            )
        }
        Err(e) => build_hook_http_response(false, Some(&e)),
    };

    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.flush().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_hook_body() {
        let body = r#"{"cmd":"ping"}"#;
        let result = parse_hook_http_body(body);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().cmd, "ping");
    }

    #[test]
    fn parse_hook_body_with_fields() {
        let body = r#"{"cmd":"hook-event","event":"Stop","session":"abc"}"#;
        let result = parse_hook_http_body(body);
        assert!(result.is_ok());
        let cmd = result.unwrap();
        assert_eq!(cmd.cmd, "hook-event");
        assert_eq!(cmd.event, Some("Stop".to_string()));
    }

    #[test]
    fn parse_invalid_hook_body() {
        let result = parse_hook_http_body("not json at all");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid JSON"));
    }

    #[test]
    fn build_ok_response_contains_200() {
        let resp = build_hook_http_response(true, None);
        assert!(resp.contains("200 OK"));
        assert!(resp.contains(r#""ok":true"#));
    }

    #[test]
    fn build_error_response_contains_400() {
        let resp = build_hook_http_response(false, Some("bad input"));
        assert!(resp.contains("400 Bad Request"));
        assert!(resp.contains("bad input"));
    }

    #[test]
    fn build_response_has_content_length() {
        let resp = build_hook_http_response(true, None);
        assert!(resp.contains("Content-Length:"));
    }

    #[test]
    fn prepare_socket_removes_stale_file() {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ps_sock_stale_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("panestreet.sock");

        // Arrange: create a stale file at the socket path (nobody listening)
        std::fs::write(&path, b"stale").unwrap();
        assert!(path.exists());

        // Act
        prepare_socket(&path).expect("stale socket should be cleared");

        // Assert: file is gone, ready for bind
        assert!(!path.exists(), "prepare_socket should remove stale file");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prepare_socket_refuses_when_listener_alive() {
        use std::os::unix::net::UnixListener as StdUnixListener;
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ps_sock_live_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("panestreet.sock");

        // Arrange: bind a live listener on the socket path
        let _listener = StdUnixListener::bind(&path).expect("bind test listener");

        // Act + Assert: prepare_socket must refuse (another instance is live)
        let result = prepare_socket(&path);
        assert!(
            result.is_err(),
            "prepare_socket must return Err when another instance is live"
        );

        drop(_listener);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prepare_socket_succeeds_when_path_is_empty() {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ps_sock_empty_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("panestreet.sock");

        prepare_socket(&path).expect("empty path should be fine");
        assert!(!path.exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn extract_body_handles_crlf_separator() {
        let req = "POST / HTTP/1.1\r\nHost: x\r\n\r\n{\"a\":1}";
        assert_eq!(extract_http_body(req), "{\"a\":1}");
    }

    #[test]
    fn extract_body_handles_lf_only_separator() {
        let req = "POST / HTTP/1.1\nHost: x\n\n{\"a\":1}";
        assert_eq!(extract_http_body(req), "{\"a\":1}");
    }

    #[test]
    fn extract_body_prefers_crlf_when_both_present() {
        let req = "POST / HTTP/1.1\r\nHost: x\r\n\r\nbody\nwith\nnewlines";
        assert_eq!(extract_http_body(req), "body\nwith\nnewlines");
    }

    #[test]
    fn extract_body_returns_empty_when_no_separator() {
        assert_eq!(extract_http_body("GET / HTTP/1.1"), "");
    }

    #[test]
    fn port_file_write_is_atomic() {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let tmp = std::env::temp_dir().join(format!("ps_port_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&tmp).unwrap();
        let path = tmp.join("http-hook-port");

        // Writer thread: alternates between two valid ports quickly
        let path_w = path.clone();
        let writer = std::thread::spawn(move || {
            for i in 0..200u16 {
                let p = 40000u16 + (i % 10);
                write_port_file_atomic(&path_w, p).unwrap();
            }
        });

        // Reader: whenever the file exists, contents must parse to a u16
        let path_r = path.clone();
        let reader = std::thread::spawn(move || {
            for _ in 0..500 {
                if let Ok(contents) = std::fs::read_to_string(&path_r) {
                    assert!(
                        !contents.is_empty(),
                        "port file must never be empty when present"
                    );
                    contents
                        .trim()
                        .parse::<u16>()
                        .expect("port file must always be a valid u16");
                }
            }
        });

        writer.join().unwrap();
        reader.join().unwrap();

        // After writes complete, no .tmp artifact should linger
        let tmp_artifact = path.with_extension("port.tmp");
        assert!(
            !tmp_artifact.exists(),
            "tmp artifact should have been renamed"
        );

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
