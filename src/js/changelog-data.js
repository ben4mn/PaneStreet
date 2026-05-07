// Hardcoded, user-centric changelog entries.
// Add new entries at the top of the array for each release.

export const CHANGELOG_ENTRIES = [
  {
    version: 'v0.4.46',
    date: '2026-05-07',
    body: `
- **Companion stays on top of terminal panes** — The mascot no longer vanishes behind the xterm.js WebGL canvas. It now lives on its own compositor layer and properly clears in-app modals.
- **Focus mode survives pane close & minimize** — Closing or minimizing the focused pane now promotes the next pane into focus instead of silently dropping out to the grid. The focus button and visible layout stay in sync.
- **Tile exits focus mode cleanly** — Clicking Tile while in focus mode now exits focus explicitly, so the focus button doesn't end up stuck active over a tiled layout.
- **Freeform focus drops dead handles** — In freeform layout, the fullscreened pane no longer shows drag handles it can't actually use.
- **Focus mode persists across restarts** — The maximized pane index is now saved with session state, so relaunching keeps you on the exact pane you were focused on (not just a best guess from focused_index).
- **Companion speaks as Claude** — The mascot's speech bubble now surfaces a snippet of Claude's actual last message on Stop / Notification / StopFailure hooks, instead of always saying "All done."
- **Notification debounce** — Bursty Stop→Notification sequences from a single Claude turn now collapse into one OS toast instead of two.
- **Accurate unread counter** — Notification unread count now tracks per-entry read state, so it no longer drifts when the history cap trims old notifications.
- **Full Disk Access guide** — New \`docs/full-disk-access.md\` explains how to grant PaneStreet one-time file access and stop the repeated macOS permission prompts.
`
  },
  {
    version: 'v0.4.45',
    date: '2026-05-04',
    body: `
- **Mascot easter eggs back in business** — Reset any stuck mascot preferences with the new "Reset Easter Eggs (Mascot)" command in the palette (Cmd+K). Sweeping, dancing, and other idle animations will run again.
- **More reliable session restore** — Sessions now save atomically to disk with a \`.bak\` fallback, so a crash or power loss won't leave you with an empty workspace. Corrupt files are preserved as \`sessions.json.corrupt-<timestamp>\` for forensics rather than silently discarded.
- **Session restore remembers more** — Sidebar collapsed state and width, footer height, active panels, and per-pane font size are now saved and restored. Default scrollback capture bumped from 500 to 2000 lines (configurable via \`ps-scrollback-lines\` in localStorage).
- **Window position persists** — PaneStreet now remembers your window's size and position between launches via \`tauri-plugin-window-state\`.
- **Debounced save + flush on quit** — Session state writes are now debounced (300ms) during interactive work, and flushed synchronously when you close the app.
- **Hook reliability fixes** — Claude Code hook notifications now survive unusual home-directory paths (single quotes, backslashes) that previously broke the Python bridge silently. Errors are logged to \`~/.pane-street/hooks.log\` with 1 MB rotation instead of being swallowed.
- **Multi-instance protection** — PaneStreet now refuses to start if another instance is already running on the same socket, rather than silently stealing its hooks.
- **Cleaner status detection** — Fixed a bug where help text mentioning "command not found" in quotes would incorrectly flag a pane as errored.
- **Frontend notification errors surfaced** — Desktop notification failures now log to the console instead of being silently dropped.
`
  },
  {
    version: 'v0.4.42',
    date: '2026-04-07',
    body: `
- **Rich changelog in Settings** — Release notes now render with full markdown support including tables, task lists, ordered lists, and images
- **Mermaid diagram support** — Mermaid diagrams in markdown files and changelogs now render as interactive charts
- **Shared markdown engine** — Consistent markdown rendering across the file viewer and changelog
`
  },
  {
    version: 'v0.4.41',
    date: '2026-04-07',
    body: `
- **Expandable changelog in Settings** — You can now read release notes directly in the About tab
- **Session profiles** — Save and restore named session configurations for different projects
- **Layout snapshots** — Quickly save and recall your pane arrangements
- **Command palette** — Press \`Cmd+K\` to access commands, sessions, and settings from anywhere
- **Improved diff viewer** — Side-by-side diffs with syntax highlighting and hunk navigation
- **File preview upgrades** — Better image previews with zoom and pan support
- **Dock icon badges** — See active session count at a glance in your dock
- **Notification grouping** — Related notifications are now grouped to reduce clutter
- **Git stash support** — View and manage your git stashes from the file viewer
- **Test infrastructure** — Improved reliability and stability across the app
`
  },
  {
    version: 'v0.4.40',
    date: '2026-04-06',
    body: `
- **Theme-aware tray icon** — The tray icon now adapts to your system's light or dark mode featuring the Pane mascot
- **Cleaner notifications** — Removed noisy terminal escape sequences from the notification panel
`
  },
  {
    version: 'v0.4.39',
    date: '2026-04-05',
    body: `
- **Mascot walks in the sidebar** — Pane now strolls horizontally in the sidebar for a bit of fun
- **Stand-still setting** — Prefer a calm mascot? Toggle off walking in Settings
- **Fixed permission prompts** — Resolved issues with permission dialogs not appearing correctly
`
  },
  {
    version: 'v0.4.38',
    date: '2026-04-04',
    body: `
- **Mascot movement boundaries** — Pane now stays within the sidebar area and won't float away
`
  },
  {
    version: 'v0.4.37',
    date: '2026-04-03',
    body: `
- **Fixed mascot drag issues** — Resolved conflicts with drag animations and speech bubbles
- **Smoother falling animation** — Mascot transitions are now more natural when dropping into position
`
  },
  {
    version: 'v0.4.36',
    date: '2026-04-02',
    body: `
- **Better drag detection** — Dragging the mascot from footer to sidebar now works reliably
`
  },
  {
    version: 'v0.4.35',
    date: '2026-04-01',
    body: `
- **Fixed sidebar drag** — Resolved CSS conflicts that prevented smooth vertical dragging of the mascot
`
  },
  {
    version: 'v0.4.34',
    date: '2026-03-31',
    body: `
- **Improved mascot positioning** — Pane is now draggable vertically in the sidebar and settles at the bottom when released
`
  },
  {
    version: 'v0.4.33',
    date: '2026-03-30',
    body: `
- **Fixed hook events** — Event names are now correctly passed to hook scripts instead of showing "unknown"
`
  },
  {
    version: 'v0.4.32',
    date: '2026-03-29',
    body: `
- **Notification settings** — Control which notifications you see in the new notification preferences
- **Session start alerts** — Get notified when new sessions start
- **Mascot sidebar snapping** — Pane now snaps neatly to the sidebar edges
`
  },
  {
    version: 'v0.4.31',
    date: '2026-03-28',
    body: `
- **Fixed stuck mascot** — Resolved an issue where Pane could get stuck in the broom animation
- **Notification fixes** — Fixed rendering artifacts and display bugs in the notification panel
`
  },
  {
    version: 'v0.4.30',
    date: '2026-03-27',
    body: `
- **Scoped notifications** — Hook notifications now only appear for PaneStreet sessions, reducing noise from other terminal activity
`
  },
  {
    version: 'v0.4.29',
    date: '2026-03-26',
    body: `
- **Quieter notifications** — Removed the overly noisy PreToolUse hook from the notification panel
`
  },
  {
    version: 'v0.4.28',
    date: '2026-03-25',
    body: `
- **Rich Claude Code notifications** — Notifications from Claude Code now display structured information with formatted details, similar to cmux and Ghostty integrations
`
  },
  {
    version: 'v0.4.27',
    date: '2026-03-24',
    body: `
- **Smoother borders** — Fixed flickering borders when resizing and improved transitions for maximized panes
`
  },
  {
    version: 'v0.4.26',
    date: '2026-03-23',
    body: `
- **Click easter eggs** — Discover fun interactions by clicking on the mascot
- **Improved speech bubbles** — Pane's speech bubbles now appear more reliably and look better
- **Background speech** — The mascot can now chat even when not in the foreground
- **Notification improvements** — General reliability fixes for the notification system
`
  },
];
