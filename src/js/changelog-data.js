// Hardcoded, user-centric changelog entries.
// Add new entries at the top of the array for each release.

export const CHANGELOG_ENTRIES = [
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
