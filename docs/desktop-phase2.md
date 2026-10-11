# Desktop design and performance — Phase 2

## Status and phase gate

The redesigned interface is implemented. Linux release verification and measured
results are recorded below. **Phase 2 is not complete until the redesigned build
has been checked and profiled on actual macOS hardware.** Phase 3 has not started.

The user confirmed Phase 1 build/launch and offline restart on a MacBook Air M3
with 16 GB RAM, running their reported Tahoe 26.5.2. They explicitly deferred
hosted reconnection synchronization until after the UI upgrade and Vercel backend
setup. That check remains pending; fixture synchronization does not close it.

The user subsequently reported **99 JavaScript and eight Rust tests passing on
their Mac**, and supplied UI/runtime feedback. The fixes and updated verification
are recorded in [Mac feedback fixes](desktop-feedback.md). The updated source now
has 106 JavaScript and ten Rust tests; the new Mac build still needs verification.

## Design decisions

The actual [GR8R reference](https://gr8r-studio.vercel.app/) was inspected in the
collaborative browser, including dashboard, tasks, projects, light/dark colors,
computed typography, spacing and navigation. Base adopts its warm paper and
charcoal surfaces, Geist typography, compact sidebar and breadcrumb bar,
hairline cards and restrained indigo actions. Base keeps its own information
architecture, integrations and personal workflows.

`app/globals.css` provides shared tokens, focus states and primitives. The font
and its OFL license live in `public/fonts/`; both builds serve it locally.
`app/layout.tsx` uses `next/font/local`, following the installed Next 16.4 font
documentation. Existing explicit themes and user accent preferences remain;
System appearance now follows the OS. Text uses a separate readable action
foreground. Reduced motion disables transitions; inactive windows pause CSS
animation and skip page entrance animation. Page transitions animate opacity
for 140 ms, without transforming fixed dialogs or moving whole layouts.

Shared components under `components/ui/` provide headings, empty/skeleton states,
Radix context menus and focus-managed calendar editors. `ContentContainer`,
`Sidebar`, `Topbar`, `CommandBar` and desktop controls share the new shell. Global
search includes tasks, projects, notes and boards, with bounded results and
keyboard selection. Existing shortcuts, sidebar/dock preferences and native
menus remain available.

## Page changes and retained behavior

| Page | Interface and performance changes |
| --- | --- |
| Dashboard | Compact metrics and widget grid; calendar preview; enable, reorder, drag and reset widgets. Keyboard reorder controls offer the same action. Existing widgets remain available. Linear aggregation replaces repeated task scans. |
| Tasks | Compact list and kanban views, search, contextual actions and memoized rows. Lists above 100 tasks render a measured virtual range. Editing, expanded, focused and open-menu rows stay mounted while scrolling. Priorities, categories, recurrence, subtasks, reorder and delete undo remain. |
| Calendar | Month, selected week and agenda modes; bounded busy-day previews and virtual large agendas. Sources, recurring events and editing retain existing logic. Radix editor traps focus and restores it on dismissal. |
| Projects/detail | Neutral cards, colored project marks, actual task progress and shared headings. Task/note/link counts use one indexed pass. Milestones, documents, files and links remain. |
| Notes/wiki | Warm neutral tree/editor/graph surfaces, clear title and reading typography. Existing rich blocks, hierarchy, locks, templates, trash, graph and print/export remain. |
| Vision | Compact canvas controls, 50–175% centered zoom, pan mode and middle-button pan. Pointer/drawing/drop coordinates account for zoom. Offscreen items are culled; editing items, long captions and music remain mounted. Images decode asynchronously. Drawing, resizing, rotation, undo and media remain. |
| Finance | Shared headings, quiet metrics/cards and consistent actions. Existing income, transactions, subscriptions, wallets and lazy chart code remain. |
| Focus | Minimal timer and history. A deadline handles throttled background execution without losing elapsed time. Only the active foreground display ticks; one completion deadline logs/notifies. Existing manual sessions and timer modes remain. |
| News | Shared editorial hierarchy, neutral cards, readable sections and provider error states. Existing briefing, news, markets and social sources remain. |
| Shopping, reading, watch | Consistent headings, cards, controls and actions, retaining each list's existing metadata and editing behavior. |
| Settings | Consistent sections/controls and System theme option. Existing integration, account, navigation and data preferences remain. |

Portfolio and market charts now use theme-aware axes/tooltips, disable internal
draw animations and debounce resize observations. The wiki force-layout graph
cancels its animation frame on unmount/inactivity and resumes its finite
simulation on focus; losing focus also releases stale drag state. Existing
pairwise repulsion remains and needs further profiling for very large graphs.

React 19, Tailwind 4 and existing Radix packages are reused. Small additions are
TanStack Virtual, Radix Context Menu and Motion with dynamically loaded features.
Unused `react-grid-layout` was removed: the old dashboard explicitly disabled
both dragging and resizing and did not persist its layout. No record collection,
backend credential, SQLite schema, legacy key or native Swift implementation was
removed or migrated in Phase 2.

## Automated verification

- Root and desktop TypeScript checks pass.
- 99 Node tests pass, including the existing synchronization/auth/migration
  coverage and six UI business-logic tests: widget preferences/order, timer
  deadlines/pauses and canvas visibility/retention.
- Eight Rust tests pass; formatting and Clippy with warnings denied pass.
- ESLint: zero errors, four warnings. Three are existing wiki/login warnings;
  TanStack Virtual adds the React Compiler incompatible-library warning. React
  Compiler is not enabled; the virtualizer component must not be automatically
  memoized. No warning was suppressed.
- Next.js, Vite and optimized Tauri builds are checked separately. The desktop
  production frontend remains locally bundled and requires no Node server.
- Production dependencies have zero audit findings at verification. Existing
  development ESLint dependency advisories remain; no forced downgrade was used.

Use the commands in [desktop verification](desktop-verification.md). A successful
build does not verify a live provider, notification permission, signed updater
or actual Vercel/Upstash staging environment.

## Runtime verification

The Linux app runs its bundled frontend in GTK/WebKit on an isolated Xvfb X11
display using software rendering. Data and configuration are isolated with
`XDG_DATA_HOME` and `XDG_CONFIG_HOME`. No production records were accessed or
changed by fixture tests.

The redesigned task list was exercised with 10,000 records in SQLite. An offline
title edit committed to the document/outbox and survived clean quit and restart.
The interface retained the queue and exposed outage/conflict recovery controls.
The loopback fixture calls the actual auth/sync handlers with an in-memory Redis
protocol adapter; it remains separate from the deferred hosted staging check.

Additional browser checks of the same shared components used 1,000 tasks and
500 board items: task editing remained mounted after a 40,000-pixel scroll;
saving retained the typed title. Context menus exposed existing task actions.
Dashboard keyboard reordering persisted across reload. Calendar editors focused
their input, dismissed with Escape and returned focus to New event. Ctrl+K
located a task and handed its query to Tasks. Vision zoom changed the transform
to 75%, rendering 49 nearby items versus 36 at 100%, rather than mounting all
500. These are actual component interactions, not screenshot mocks.

Drag-and-drop reordered dashboard cards through the collaborative browser's
pointer drag tool. An rAF probe observed one pending wiki graph frame while
the graph was open and zero 100 ms after returning to the editor. In native
WebKit, a running focus timer advanced from 24:58 to 24:25 after hiding and
restoring the window. Resizing the native window to 900×650 retained usable
navigation and scrollable content.

The final release also rendered a 1,000-paragraph research journal in an isolated
3,622,295-byte workspace. A typed edit reached SQLite and remained after quit
and restart. The action-to-SQLite observation was 1,544.9 ms in one smoke sample,
including synthetic typing and 30 ms polling; this is not a keystroke latency
benchmark. A populated portfolio with 91 stored daily snapshots rendered in
both themes. Large-note and chart snapshots are included with the other images.

A 10,000-task **web browser** fixture exceeded its existing localStorage quota.
The existing recovery UI preserved the saved copy, blocked unsafe edits and
exported both saved and unsaved work (9,821,378 bytes). A smaller fixture loaded
normally. Desktop SQLite handled the workload. Browser IndexedDB migration is
still a separate unresolved performance limitation; do not claim web storage
supports that workload.

## Profiling and reproduction

Hardware: AMD Ryzen 5 5600G, 12 logical CPUs, Arch Linux x86-64, kernel 7.1.9,
WebKitGTK 2.52.6, GTK 3.24.52, Node 25.9 and Rust 1.98. Native window: 1280×850
on Xvfb 1440×1000, X11 software rendering. No compiler was running during final
native samples. Shared WebKit pages are apportioned by PSS; RSS double-counts
shared pages. CPU is percent of **one core** across the application and WebKit
children. Other workstation activity cannot be fully isolated.

Release diagnostic modes are opt-in, do not expose credentials or record content,
and do not run in normal use:

```sh
BASE_DESKTOP_PROFILE=1 apps/desktop/src-tauri/target/release/base-desktop
# Also run 120 animation frames of task scrolling, after first route readiness:
BASE_DESKTOP_PROFILE=1 BASE_DESKTOP_PROFILE_FRAMES=1 apps/desktop/src-tauri/target/release/base-desktop
# Linux only; run after startup settles and while no build is running:
python scripts/profile_desktop.py "$(pgrep -x base-desktop)" --seconds 30
```

Only enable automatic scrolling in an isolated test workspace. Startup logs time
from Rust application initialization to the first loaded route plus two animation
frames, and frontend navigation time through local hydration. They do not include
time before Rust initialization or prove all below-fold content has painted.
Scroll intervals are requestAnimationFrame timing, not a GPU presentation/FPS
measurement. The profiling code is dynamically loaded only with the explicit
native diagnostic flag.

The workload generator writes **only** to the loopback service:

```sh
node --no-warnings --import ./tests/resolve-alias.mjs --experimental-strip-types tests/support/desktop-workload.mts 10000
```

Use an isolated desktop profile and connect to the fixture to hydrate it before
testing offline. A generated workload replaces fixture memory, never production
storage. Retain the original local profile when testing migration or recovery.

Three fresh-process launches against the same cached local workspace (10,000
tasks, 500 board items; OS caches not cleared) reported native first-route
readiness of **1,061 / 834 / 831 ms**, and frontend readiness of **651 / 578 /
576 ms**. These are cached-data launches, not cold-disk benchmarks. All three
processes quit cleanly after the scroll sample.

| Release measurement | Result |
| --- | --- |
| Task scroll, 119 measured rAF intervals per run | p50: 16 / 14 / 15 ms; p95: 20 / 19 / 20 ms; maximum: 28 / 26 / 23 ms |
| Rows mounted at the end of each scroll sample | 26 out of 8,334 open tasks (10,000 total records) |
| Settled, focused task view, 30 seconds | 0.067% CPU of one core; RSS 747.12 → 747.13 MiB; PSS 479.53 → 479.59 MiB |
| Unmapped X11 window, 30 seconds | 0.200% CPU; RSS 809.75 → 752.09 MiB; PSS 542.82 → 484.80 MiB |
| Running focus timer, unmapped for 30 seconds after browsing all routes | 0.067% CPU; RSS 954.72 → 949.75 MiB; PSS 681.03 → 676.06 MiB |
| 1,000-paragraph note at rest, 30 seconds | 0.100% CPU; RSS 717.76 → 713.77 MiB; PSS 446.53 → 442.14 MiB |
| Populated portfolio view, 30 seconds including route/theme settling | 0.300% CPU; RSS 1011.92 → 887.74 MiB; PSS 738.52 → 614.28 MiB |
| Cached SQLite SELECT of 2,971,431-byte document, 100 samples | median 1.729 ms; p95 1.948 ms |
| Vite entry | 381.67 kB / 121.52 kB gzip |
| Lazy chart / wiki / Motion features chunks | 317.60 / 188.17 / 38.16 kB; gzip 95.19 / 50.15 / 14.63 kB |
| Linux installers | .deb 8.03 MiB; .rpm 8.03 MiB; AppImage 102.93 MiB |

The unmapped window is a visibility proxy in Xvfb without a window manager,
**not an actual minimized desktop or battery test**; its sample includes WebKit
settling. The SQLite sample uses a cached connection in Python and measures only
SELECT/string retrieval, not desktop edit latency or Rust/JavaScript JSON parsing.
Memory remains substantial and needs native GPU/Mac analysis; no minimal-RAM
claim is made. Phase 1's one-task dashboard sample is a different workload and
cannot establish a like-for-like improvement. The entry bundle grew from Phase
1's 288.19 kB; extra interactions have a cost even with route/feature splitting.

Palette contrast calculations: light text/background 16.32:1, muted/secondary
surface 6.92:1, faint/secondary surface 4.79:1 and primary-button text 5.58:1;
dark equivalents 14.49:1, 7.25:1, 5.21:1 and 7.10:1. This checks the core token
pairs, not every composited badge, media item or user-provided accent.

Raw numeric samples are in [performance/desktop-phase2](performance/desktop-phase2).
Their build record identifies the final binary checksum and notes that task,
startup and focus samples preceded the final chart/graph refinements; those
refinements did not change the measured task/startup execution paths. The
large-note and populated chart checks used the final release.
Stable screenshots from the final bundled app are in
[screenshots/desktop-phase2](screenshots/desktop-phase2), including both dashboard
themes, the large task list and the redesigned major routes. Fixture data is
synthetic. The initial resumed test could not initialize GTK because its Xvfb
process had stopped; restarting the test display resolved that environment failure.

## Mac verification and remaining release work

Run the Phase 1 common checks again on the redesigned source, then:

```sh
npm run desktop:build -- --bundles app,dmg
BASE_DESKTOP_PROFILE=1 'apps/desktop/src-tauri/target/release/bundle/macos/Base.app/Contents/MacOS/base-desktop'
```

Record three launches with no build/dev server running: the first launch of a
fresh test profile and two warm launches. Keep normal account data separate.
Record Activity Monitor memory and CPU for a settled dashboard, a large task
list, notes and vision. For idle and minimized measurements, sample at least
30 seconds; record app and WebKit processes. Use Instruments Time Profiler and
Animation Hitches for scrolling, canvas zoom/pan and resizing; Energy Log for a
representative focus session. Report hardware, workload, OS version and whether
the window is active. Do not infer battery drain from CPU alone.

Review light/dark/System themes, reduced motion, keyboard search/navigation,
context menus, all calendar modes, widget order, notes and project detail,
vision drawing/dragging at multiple zoom levels, finance and all lists. Repeat
offline edit/restart checks with the new build. Hosted two-device reconnection
and conflict checks will follow an isolated Vercel staging deployment.

Actual macOS Phase 2 build/runtime/performance, Intel runtime, Wayland/GPU/high-DPI,
screen-reader audit, battery measurements, signed updates/notarization and live
third-party integrations remain pending. No Vercel deployment, production data
migration or signing change occurred. Keep Phase 1 commit `3f34f50` and legacy
Swift app available for rollback; Phase 2 does not alter the SQLite schema.
