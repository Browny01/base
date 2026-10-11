# Mac feedback fixes — Phase 2

Updated 2026-10-11. These are implemented changes following the user's MacBook
Air M3 / 16 GB / reported Tahoe 26.5.2 test. The user reported all 99 JavaScript
and eight Rust tests passing on the previous source. **This revised build has
been verified on Linux, not yet on macOS.** Hosted Vercel reconnection remains
deferred under the user's revised phase gate. Phase 3 has not started.

## Implemented changes

- The Tauri product is **Base**, producing `Base.app`. The application identifier,
  SQLite location, credential scope and internal `base-desktop` executable stay
  unchanged to preserve data and sessions. Keep the previous source/build for
  rollback; no database schema migration or production change is required.
- The extra desktop status bar is removed. A compact saved/pending/conflict
  indicator and sync icon sit in the real top bar beside Keyboard Shortcuts.
  Outage/recovery messages appear as dismissible bottom-right toasts with a
  Settings action. Repeated retries do not stack identical warnings.
- Account, session renewal, sync, conflict resolution, backups, local note
  passwords, notifications and signed updates are in **Settings → Account &
  sync**. Settings now has Appearance, Navigation and News & integrations
  categories with constrained form widths and scrollable content. Existing
  settings and encrypted integration credentials are retained.
- Sidebar order and mobile dock tabs use pointer drag handles and keyboard
  up/down controls. A custom sidebar order now actually applies across sections.
  Sidebar typography uses the bundled Geist font and consistent, lighter icons;
  shared icon styling aligns the rest of the interface.
- Dashboard Customize exposes draggable widget headers and bottom-right resize
  handles. Width snaps to grid columns; height snaps to 16 px with bounds.
  Order and dimensions persist in device preferences. Handles also support
  keyboard arrows and Escape cancellation. Pointer capture replaces HTML drag
  behavior that can differ in native WebKit. No drag library or idle loop is
  added; transient pointer movement updates the active tile, saving on release.
- Focus now has daily summaries, a timer panel, session intention/context and
  history. Full-screen mode remains available. Existing timer deadlines, pause,
  reset, manual logging and foreground-only display updates are retained.
- Notes Templates uses a collision-aware Radix menu with readable descriptions
  and keyboard navigation. Folder creation/rename uses a native-compatible
  in-app dialog instead of `prompt()`. Existing hierarchy and folder moves stay.
- Rich text supports Cmd/Ctrl+B, I, U and K, Shift+X for strike-through and
  Shift+backslash for clearing formatting. Editable notes consume those commands
  before global shortcuts; Cmd/Ctrl+K elsewhere remains the command palette.
  Links use a focused dialog and preserve the text selection. Code blocks keep
  their own behavior. Ordinary copy/paste/select/undo use the existing editor
  and native Edit menu.
- Buffered note edits flush before native quit, window close and workspace
  switches. Leaving an unchanged note no longer creates an update/outbox entry.

## Sync cursor recovery

The error means the cached client revision is greater than the service's stored
revision. The local fixture stores records in memory, making reset/restart a
plausible explanation for the reported sequence; the user's original terminal
logs alone do not establish exactly how its state changed.

`lib/sync-v2-server.ts` now returns an authenticated, read-only recovery snapshot
with an explicit marker instead of repeatedly throwing that error. It neither
applies the submitted operations nor acknowledges them during recovery. The
shared `packages/sync/src/recovery.ts` preserves acknowledged local records,
pending edits/deletions and new server records. Only actual acknowledged or
edited roots become review candidates; untouched UI defaults do not.

Desktop persistence archives the complete old document, baseline, outbox and
conflicts before replacing the queue with reviewable differences, all in one
SQLite transaction. The browser performs the equivalent locked persistence.
Each difference requires an explicit decision; Base does not automatically
overwrite the reset service or silently discard local edits. Keeping an edit
creates a new operation against the recovered revision. Recovery archives are
included in workspace exports. Existing conflicts and unknown source fields
remain retained. Older clients fail closed on a backward revision and keep their
local data; upgrade backend and client together for automatic recovery.

The fixture-only reset command and startup instructions are in
[desktop verification](desktop-verification.md#isolated-service-for-native-transport-checks).
There is no production reset endpoint. A fixture process restart also replaces
sessions/account identity; reconnecting a new account must not merge the old
cached account automatically. Retain/export the old workspace rather than
deleting its database.

## Verification of the revised build

Environment: Ryzen 5 5600G, Arch Linux x86-64, GTK/WebKitGTK, Xvfb X11 software
rendering at 1280×850, isolated data/configuration directories, loopback fixture.
Production accounts, data and credentials were not changed.

- Root/desktop TypeScript pass; **106 JavaScript tests pass**, including reset
  snapshots, receipt preservation, explicit deletions, default-root filtering,
  browser recovery archives and restored edits, widget sizes/order and format
  key mappings. **Ten Rust tests pass**, including atomic recovery/rollback.
- Rust formatting and Clippy with warnings denied pass. ESLint has zero errors
  and four existing/nonfatal warnings described in the Phase 2 report.
- Next.js and locally bundled Vite/Tauri production builds pass. Linux `.deb`
  and `.rpm` packages build, each 8.04 MiB. Vite entry: 384.93 kB / 122.79 kB
  gzip. These sizes are build observations, not runtime memory measurements.
- Browser interactions verified folder creation, Templates menu, bold/italic/
  underline/link editing and persistence, Settings drag order, dashboard pointer
  order/resize/reload and keyboard resizing. Forms fit their content columns.
- The final installed frontend ran in native WebKit with existing SQLite data
  and archives intact. Widget pointer movement, destination feedback, reordering
  and resizing worked; previously saved dimensions remained after restart.
  Focus and Settings rendered in light/dark themes.
- A note was typed, made bold and underlined, then quit about 50 ms after its
  final formatting action, before the 400 ms debounce. SQLite held the complete
  `<b><u>Saved before debounce</u></b>` text; restart displayed it. Opening and
  leaving that unchanged note kept the outbox count at eight.
- A fresh connected profile cached server revision one. During an outage it
  created a task, then recovered against a reset revision zero. All three tasks
  remained visible, with three review differences, no ordinary pending entries
  and one full recovery archive holding both original pending operations.
  Keeping the offline task uploaded it once alongside the new server task;
  the queue drained, its conflict was resolved and the archive remained.
  The other differences remained pending review. Native quit exited cleanly.

Actual bundled screenshots are in
[screenshots/desktop-phase2-feedback](screenshots/desktop-phase2-feedback).
These smoke checks do not verify actual Mac WebKit, Wayland, GPU/battery behavior,
signing, notification permission, live integrations or hosted Upstash Lua.

## Memory and Mac follow-up

The user's **80–200 MB `com.apple.WebKit.WebContent`** observation is recorded
without claiming a leak or a reduction. It describes one process, not total app
memory; pages, images, charts and editor history affect it. This patch adds no
poller or animation loop and avoids writes from unchanged notes, but a new Mac
memory measurement is still required. Prior Linux workload measurements remain
in [the Phase 2 report](desktop-phase2.md); they are not directly comparable to
the Mac figure or a benchmark of this patch.

On the Mac, use the common checks in desktop verification, then:

```sh
npm ci
npm run desktop:build -- --bundles app,dmg
open 'apps/desktop/src-tauri/target/release/bundle/macos/Base.app'
```

Check Customize drag/resize and restart, Settings drag order, folder/templates,
Cmd+B/U/I/K with note focus, immediate note quit/restart, and fixture outage/reset
review. Export a backup first and keep the old app available. Existing native
data uses the same identifier; remove neither SQLite nor Keychain entries.
Record settled/minimized app plus WebKit memory and CPU, workload and elapsed
time across repeated route cycles; use Instruments if memory continues growing
without settling. Hosted two-device synchronization follows Vercel staging setup.

Phase 2 remains open for the revised Mac runtime/performance and the previously
deferred hosted integration checks. No iPhone migration work was started.
