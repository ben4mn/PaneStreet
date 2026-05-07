# Granting Full Disk Access to PaneStreet

If macOS keeps asking you to approve file access every time PaneStreet touches
`~/.claude`, your project directories, or `~/Documents`, grant **Full Disk
Access** once and the prompts go away.

## Steps

1. Quit PaneStreet. (Cmd+Q, or right-click the dock icon → Quit.)
2. Open **System Settings** → **Privacy & Security** → **Full Disk Access**.
3. Click the **+** button. You may be asked to authenticate.
4. Navigate to PaneStreet's bundle:
   - Release build: `/Applications/PaneStreet.app`
   - Installed via DMG elsewhere: wherever you moved it
5. Select `PaneStreet.app` and click **Open**.
6. Make sure the toggle next to PaneStreet is **on**.
7. Relaunch PaneStreet.

That's it. File access prompts should no longer appear for `~/.claude`,
project directories, or files the app needs to read/write.

## Caveats

- **Grant is tied to the app bundle path.** If you reinstall PaneStreet to a
  different location, you'll need to remove the old entry from Full Disk
  Access and add the new one.
- **Dev and production builds are treated as separate apps.** If you run
  both `npm run tauri dev` (debug build in `src-tauri/target`) and the
  release `.app`, add both to Full Disk Access. They have different TCC
  identities as far as macOS is concerned.
- **Updates via auto-updater preserve the grant** — the bundle path stays
  the same, so you won't need to re-grant after a version bump.
- **Removing the app from Full Disk Access** is the undo: same panel,
  select PaneStreet, click the `-` button.

## Why not fix this in code?

Short answer: the prompts are macOS TCC (Transparency, Consent, and
Control), not a PaneStreet permission check. PaneStreet's Rust backend
reads and writes files through `std::fs::*` directly rather than
Tauri's `fs` plugin, so adding Tauri scopes wouldn't stop TCC from
gating access. The right long-term fix is proper code signing with
an Apple Developer ID and declared entitlements — which is on the
roadmap but not wired up today. Full Disk Access is the one-time,
persistent workaround that matches what you'd do for any other macOS
app that needs broad file access (like a backup tool or IDE).
