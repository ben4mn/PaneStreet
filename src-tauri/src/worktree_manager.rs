use git2::{Repository, StatusOptions};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

// --- Structs ---

#[derive(Clone, Serialize)]
pub struct GitInfo {
    pub branch: String,
    pub repo_root: String,
    pub is_worktree: bool,
}

#[derive(Clone, Serialize)]
pub struct RepoSummary {
    pub info: GitInfo,
    pub active_worktree_count: usize,
}

#[derive(Clone, Serialize)]
pub struct WorktreeResult {
    pub path: String,
    pub branch: String,
}

#[derive(Clone, Serialize)]
pub struct WorktreeStatus {
    pub has_changes: bool,
}

struct ManagedWorktree {
    #[allow(dead_code)]
    session_id: String,
    worktree_path: String,
    #[allow(dead_code)]
    branch_name: String,
    repo_root: String,
}

static WORKTREE_MAP: std::sync::LazyLock<Mutex<HashMap<String, ManagedWorktree>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

// --- Commands ---

#[tauri::command]
pub fn get_git_info(cwd: String) -> Result<Option<RepoSummary>, String> {
    let repo = match Repository::discover(&cwd) {
        Ok(r) => r,
        Err(_) => return Ok(None), // Not a git repo
    };

    let repo_root = repo
        .workdir()
        .or_else(|| repo.path().parent())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // Determine if this is a worktree
    let is_worktree = repo.is_worktree();

    // Get current branch name
    let branch = match repo.head() {
        Ok(head) => {
            if head.is_branch() {
                head.shorthand().unwrap_or("HEAD").to_string()
            } else {
                // Detached HEAD — show short hash
                head.target()
                    .map(|oid| format!("{:.7}", oid))
                    .unwrap_or_else(|| "HEAD".to_string())
            }
        }
        Err(_) => "HEAD".to_string(),
    };

    // Count managed worktrees for this repo
    let canonical_root = std::fs::canonicalize(&repo_root)
        .unwrap_or_else(|_| std::path::PathBuf::from(&repo_root))
        .to_string_lossy()
        .to_string();

    let active_worktree_count = WORKTREE_MAP
        .lock()
        .map_err(|e| e.to_string())?
        .values()
        .filter(|wt| {
            let wt_root = std::fs::canonicalize(&wt.repo_root)
                .unwrap_or_else(|_| std::path::PathBuf::from(&wt.repo_root))
                .to_string_lossy()
                .to_string();
            wt_root == canonical_root
        })
        .count();

    Ok(Some(RepoSummary {
        info: GitInfo {
            branch,
            repo_root,
            is_worktree,
        },
        active_worktree_count,
    }))
}

#[tauri::command]
pub fn create_worktree(
    repo_path: String,
    name: String,
    session_id: String,
) -> Result<WorktreeResult, String> {
    let repo = Repository::open(&repo_path).map_err(|e| format!("Failed to open repo: {}", e))?;

    let worktree_dir = Path::new(&repo_path)
        .join(".pane-street")
        .join("worktrees")
        .join(&name);

    std::fs::create_dir_all(&worktree_dir)
        .map_err(|e| format!("Failed to create worktree directory: {}", e))?;

    let branch_name = format!("worktree-{}", name);

    // Get HEAD commit to branch from
    let head = repo
        .head()
        .map_err(|e| format!("Failed to get HEAD: {}", e))?;
    let commit = head
        .peel_to_commit()
        .map_err(|e| format!("Failed to peel to commit: {}", e))?;

    // Create the branch
    repo.branch(&branch_name, &commit, false)
        .map_err(|e| format!("Failed to create branch: {}", e))?;

    // Create the worktree
    // Use git CLI as fallback since git2's worktree API can be tricky
    let output = std::process::Command::new("git")
        .args([
            "worktree",
            "add",
            worktree_dir.to_str().unwrap_or(""),
            &branch_name,
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run git worktree add: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Clean up the directory we created
        let _ = std::fs::remove_dir_all(&worktree_dir);
        // Try to delete the branch we created
        if let Ok(mut branch) = repo.find_branch(&branch_name, git2::BranchType::Local) {
            let _ = branch.delete();
        }
        return Err(format!("git worktree add failed: {}", stderr));
    }

    let worktree_path = worktree_dir.to_string_lossy().to_string();

    // Register in our tracking map
    WORKTREE_MAP
        .lock()
        .map_err(|e| e.to_string())?
        .insert(
            session_id.clone(),
            ManagedWorktree {
                session_id,
                worktree_path: worktree_path.clone(),
                branch_name: branch_name.clone(),
                repo_root: repo_path,
            },
        );

    Ok(WorktreeResult {
        path: worktree_path,
        branch: branch_name,
    })
}

#[tauri::command]
pub fn check_worktree_status(session_id: String) -> Result<WorktreeStatus, String> {
    let map = WORKTREE_MAP
        .lock()
        .map_err(|e| e.to_string())?;

    let wt = match map.get(&session_id) {
        Some(wt) => wt,
        None => return Ok(WorktreeStatus { has_changes: false }),
    };

    let repo = Repository::open(&wt.worktree_path)
        .map_err(|e| format!("Failed to open worktree repo: {}", e))?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("Failed to get status: {}", e))?;

    Ok(WorktreeStatus {
        has_changes: !statuses.is_empty(),
    })
}

#[tauri::command]
pub fn cleanup_worktree(session_id: String, force: bool) -> Result<bool, String> {
    // Check status first if not forcing
    if !force {
        let status = check_worktree_status(session_id.clone())?;
        if status.has_changes {
            return Ok(false); // Dirty, needs confirmation
        }
    }

    let mut map = WORKTREE_MAP
        .lock()
        .map_err(|e| e.to_string())?;

    let wt = match map.remove(&session_id) {
        Some(wt) => wt,
        None => return Ok(true), // Nothing to clean
    };

    // Remove worktree via git CLI (cleaner than manual cleanup)
    let _ = std::process::Command::new("git")
        .args(["worktree", "remove", "--force", &wt.worktree_path])
        .current_dir(&wt.repo_root)
        .output();

    // Remove the branch
    if let Ok(repo) = Repository::open(&wt.repo_root) {
        if let Ok(mut branch) = repo.find_branch(&wt.branch_name, git2::BranchType::Local) {
            let _ = branch.delete();
        }
    }

    // Clean up empty .pane-street directory structure
    let worktrees_dir = Path::new(&wt.repo_root)
        .join(".pane-street")
        .join("worktrees");
    if worktrees_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&worktrees_dir) {
            if entries.count() == 0 {
                let _ = std::fs::remove_dir_all(
                    Path::new(&wt.repo_root).join(".pane-street"),
                );
            }
        }
    }

    Ok(true)
}
