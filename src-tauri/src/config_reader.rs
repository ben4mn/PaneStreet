use serde::Serialize;
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

    // Extract MCP servers from settings
    let mut mcp_servers = Vec::new();
    if let Some(servers) = settings_raw.get("mcpServers").and_then(|v| v.as_object()) {
        for (name, config) in servers {
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

    Ok(ClaudeConfigSnapshot {
        settings_raw,
        plugins,
        mcp_servers,
        global_memory,
        project_memory,
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

// --- Session Persistence ---

fn pane_street_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".pane-street"))
}

#[tauri::command]
pub fn save_sessions(json: String) -> Result<(), String> {
    let dir = pane_street_dir().ok_or("Could not find home directory")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    std::fs::write(dir.join("sessions.json"), &json)
        .map_err(|e| format!("Failed to write sessions: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn load_sessions() -> Result<Option<String>, String> {
    let path = pane_street_dir()
        .ok_or("Could not find home directory")?
        .join("sessions.json");
    if path.exists() {
        std::fs::read_to_string(&path)
            .map(Some)
            .map_err(|e| format!("Failed to read sessions: {}", e))
    } else {
        Ok(None)
    }
}
