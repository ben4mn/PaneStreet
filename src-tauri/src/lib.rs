mod auth_manager;
mod config_reader;
mod file_viewer;
mod pty_manager;
mod status_detector;
mod worktree_manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pty_manager::spawn_pty,
            pty_manager::write_to_pty,
            pty_manager::resize_pty,
            pty_manager::kill_pty,
            worktree_manager::get_git_info,
            worktree_manager::create_worktree,
            worktree_manager::check_worktree_status,
            worktree_manager::cleanup_worktree,
            config_reader::read_claude_config,
            config_reader::save_claude_settings,
            config_reader::read_memory_file,
            config_reader::save_memory_file,
            config_reader::save_sessions,
            config_reader::load_sessions,
            auth_manager::save_api_key,
            auth_manager::get_auth_status,
            auth_manager::delete_api_key,
            file_viewer::read_directory,
            file_viewer::read_file_content,
            file_viewer::open_in_finder,
            file_viewer::open_with_default,
            pty_manager::get_process_cwd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
