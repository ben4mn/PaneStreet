mod auth_manager;
mod config_reader;
mod dock_icon;
mod file_viewer;
mod pty_manager;
mod socket_server;
mod status_detector;
mod worktree_manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::{Emitter, Manager};
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            socket_server::start(app.handle().clone());
            socket_server::start_http(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Give the frontend a chance to flush pending session state
                let _ = window.app_handle().emit("before-quit", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            pty_manager::spawn_pty,
            pty_manager::write_to_pty,
            pty_manager::resize_pty,
            pty_manager::kill_pty,
            worktree_manager::get_git_info,
            worktree_manager::get_branch_graph,
            worktree_manager::get_git_diff_stats,
            worktree_manager::get_file_diff,
            worktree_manager::create_worktree,
            worktree_manager::check_worktree_status,
            worktree_manager::cleanup_worktree,
            config_reader::read_claude_config,
            config_reader::read_scheduled_tasks,
            config_reader::save_claude_settings,
            config_reader::read_project_memories,
            config_reader::read_memory_file,
            config_reader::save_memory_file,
            config_reader::save_sessions,
            config_reader::load_sessions,
            config_reader::install_claude_hooks,
            config_reader::uninstall_claude_hooks,
            config_reader::check_hooks_installed,
            auth_manager::save_api_key,
            auth_manager::get_auth_status,
            auth_manager::delete_api_key,
            file_viewer::read_directory,
            file_viewer::read_file_content,
            file_viewer::read_file_base64,
            file_viewer::open_in_finder,
            file_viewer::open_with_default,
            pty_manager::get_process_cwd,
            pty_manager::get_listening_ports,
            pty_manager::get_pr_status,
            dock_icon::set_dock_icon,
            worktree_manager::git_stash_list,
            worktree_manager::git_stash_push,
            worktree_manager::git_stash_pop,
            worktree_manager::git_stash_drop,
            status_detector::get_idle_timeout,
            status_detector::set_idle_timeout,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
