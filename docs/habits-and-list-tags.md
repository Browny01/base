# Habits, list tags and Notes improvements — Base 0.1.8

Habits & streaks is available from navigation and the command palette on desktop
and web. Create daily check-ins or habits with a recorded value, edit previous
days, and see current/best streaks and fourteen days of activity. The workspace
timezone determines the day. Yesterday's streak remains active while today's
check-in is unfinished. Duplicate logs count once. Archive/restore keeps history.
This feature does not add scheduled reminder delivery.

Watch, Reading and Shopping items now have **Add tag / Edit** controls. Create
your own name and colour, reuse a tag on another item in that list, or rename,
recolour and remove it from the tag editor. No tags are seeded into real
workspaces. The catalog comes from assigned tags, including completed items;
removing the last assignment removes the tag from the available list. Multiple
selected tag filters match all selected tags. Shopping category and priority
filters combine with tags. Clearing completed items respects the current filters.

Tags are optional fields on existing list records. Habits use the existing
`habits` and `habitLogs` collections. No new backend root, schema upgrade or data
reset is required. The normal durable local-write queue, conflict detection and
workspace isolation apply. List mutations read the latest saved snapshot to
retain tag edits queued before completion/reordering actions.

Notes page copying exports both HTML and plain text, preserving block boundaries,
lists, numbering and supported formatting. It reads the live editor snapshot so
the debounce does not omit recent edits. Clipboard errors are reported; older
clipboard implementations can fall back to plain text. Note icons also accept a
typed/pasted emoji, including composed families, skin tones and flags.

The sidebar displays the complete supplied glass app icon at 28 px, including
its original tile and transparent edges, without a CSS crop or extra backing.
Landing screenshots and replacement instructions are
in [landing-screenshots.md](landing-screenshots.md). The new captures use only
synthetic preview data; the portrait capture represents the mobile web UI.

Verification: 191 JavaScript tests pass, including new date/DST, streak,
tag-update, legacy-field preservation and synchronization regressions. Browser
checks cover cross-block selection/export, current-editor copying, custom emoji,
tag creation/colour/reuse, combined filters, and habit creation/check-in/archive/
restore. Typechecks, lint (four existing warnings), Next and both Vite production
builds pass. The Linux Tauri release builds and a habit check-in persisted in SQLite
and remained completed after an actual native restart with external networking
unavailable. Actual macOS clipboard/device behaviour and live multi-device Cloud
acceptance remain separate manual checks. No deployment was performed.
