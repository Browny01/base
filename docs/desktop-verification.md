# Phase 1 desktop verification

Phase 1 remains **incomplete** until actual macOS build/runtime results and the
remaining integration checks below have been supplied. The user has reported
passing Mac checks; their scope is being clarified below. Phase 2 and phase 3
have not started.

## Build and run

Use Node 24 or newer and Rust 1.90 or newer. From the repository root:

```sh
npm ci
npm run typecheck
npm run desktop:typecheck
npm run lint
npm test
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
npm run build
npm run desktop:frontend
npm run desktop:dev
```

The development command uses Vite during development. Installed production
builds load `frontendDist` from the executable bundle and require no web server,
Node, Redis server, Docker or production website for rendering.

## Linux results

Hardware/environment: AMD Ryzen 5 5600G, 12 logical CPUs, Arch Linux x86-64,
kernel 7.1.9, Rust 1.98, Node 25.9, GTK 3.24.52, WebKitGTK 2.52.6. Runtime
checks used a separate Xvfb X11 display with software rendering and isolated
`XDG_DATA_HOME`/`XDG_CONFIG_HOME` directories. They never used production data.

- Both TypeScript checks pass.
- 93 Node tests pass, including merge/conflict/deletion/order/unknown-field
  cases, delayed retries, receipts, CAS contention, staged Unicode attachments,
  browser persistence/tab locks, edits during network requests, stale legacy
  writer rejection, login/session expiration/revocation, verifier compatibility
  and serializer-independent receipts.
- Eight Rust tests pass: migrations/idempotence/newer-schema rejection,
  transaction rollback, workspace isolation/revision guards, transport scope,
  backup parsing/retention and salted offline note verifier checks.
- Rust formatting and Clippy with warnings denied pass.
- ESLint passes with remaining nonfatal warnings; the baseline had 19 errors.
- Next.js and Vite production builds pass. Every existing major React route is
  locally included, with route splitting. API response types are shared without
  importing server route modules into the desktop frontend.
- Tauri optimized Linux `.deb` and `.rpm` packages have built successfully.
  The optimized `.deb` and `.rpm` are each approximately 7.95 MiB.
  The entry bundle is 288.19 kB (88.96 kB gzip); heavy chart and wiki code
  loads separately. Artifacts/logs are the authority for exact sizes.
- Actual bundled WebKit startup, local dashboard/task rendering, dark/light
  appearance, `Ctrl+Shift+N`, offline task creation, SQLite document/outbox
  persistence, restart and retained local data were checked.
- The app authenticated against an isolated HTTP fixture using the **actual**
  auth and sync handlers, with an in-memory Upstash-protocol adapter. Its device
  token was saved in the Linux OS credential store; JavaScript did not receive it.
- With that fixture returning an outage, task creation and completion remained
  durable. After recovery, the app uploaded them, preserved a concurrent server
  title change and an unknown root field, and drained its outbox without duplicate
  records. A concurrent same-field title change produced a durable conflict and
  preserved the local title in the view. Choosing “Keep my edit” updated the
  fixture server and left both conflicting values archived in SQLite.
- Native backup selection opened an isolated local workspace, retaining the
  original envelope and unknown fields. Connecting and adding that workspace
  uploaded the imported record with its unknown fields, kept existing account
  records and produced a reviewable legacy-delete conflict. A malformed test
  task exposed a render failure; imports now reject missing required task fields,
  and page recovery preserves access to navigation and workspace export.
- After correcting the D3/prototype-freezing incompatibility, Notes rendered
  normally. A wrong note password was rejected; the correct cached password
  unlocked the note with an expired service session. An offline note edit and
  project creation/detail navigation persisted successfully in SQLite.
- Calendar, Finance, Vision, Focus, Shopping, Reading, Watch, News and Settings
  routes opened in bundled WebKit. The command palette and new-project shortcut
  worked. Native window-close and the Linux Ctrl+Q quit command exited with code
  zero; subsequent startup retained the document and queued edits.
- The final release binary repeated cached startup and clean quit successfully.
  Signing out of the fixture returned to the retained anonymous local workspace;
  the cloud workspace's queued note/project edits remained in SQLite.

### Limited idle measurement

One 30.000-second sample on the hardware above, after the final release binary
settled on its local dashboard with one task, no running focus timer and no
interaction, measured **0.10% of one CPU core** across the Rust application,
WebKit web process and WebKit network process. `/proc/PID/stat` user/system ticks
were summed and divided by elapsed monotonic time and `SC_CLK_TCK`. Aggregate
RSS was 589.7 → 585.7 MiB; aggregate proportional set size (PSS) was
332.2 → 327.7 MiB, read from `/proc/PID/smaps_rollup` at both endpoints. RSS
double-counts shared pages; PSS apportions them. Xvfb and the service fixture were
excluded. No builds were running during the sample.

This X11/software-rendered sample is a smoke measurement, not a sustained idle,
minimized-window, battery, startup or GPU benchmark. Memory still needs profiling
against larger workloads in phase 2. No macOS performance result is available.

### Native screenshots

These images show isolated fixture data in the actual bundled GTK/WebKit app:

- [Offline unlocked note](screenshots/desktop-phase1/notes-offline.png)
- [Conflict review](screenshots/desktop-phase1/conflict-review.png)
- [Offline project detail](screenshots/desktop-phase1/project-offline.png)
- [Native Linux menu](screenshots/desktop-phase1/native-menu.png)

These are functional smoke checks, not comprehensive page-by-page regression,
GPU, battery or large-workload performance measurements. An Xvfb test does not
verify Wayland behavior. Production Upstash Lua execution, real third-party
credentials, signed updates, notifications and print dialogs need the checks
below. Phase 2 will perform full profiling and visual redesign after the gate.

## Isolated service for native transport checks

In a separate terminal:

```sh
node --no-warnings --import ./tests/resolve-alias.mjs --experimental-strip-types tests/support/native-service.mts
```

Connect the installed app to `http://127.0.0.1:3456` using `fixture-password`.
This fixture binds only to loopback, uses memory storage, never loads `.env.local`
and never connects to production. It calls real route handlers but emulates Redis
commands; it does not replace a Vercel/Upstash staging test.

To simulate a service outage and recovery:

```sh
curl -X POST http://127.0.0.1:3456/test/control -H 'Content-Type: application/json' -d '{"offline":true}'
# Make changes in the app; check they survive restart.
curl -X POST http://127.0.0.1:3456/test/control -H 'Content-Type: application/json' -d '{"offline":false}'
```

Retries are bounded (five exponential-backoff attempts). Reconnect, foreground
activation, new edits and “Sync now” restart synchronization; no idle poller runs.
Close the fixture after testing and sign out of its account in the app.

## macOS results reported by the user

- Hardware: MacBook Air M3, 16 GB RAM.
- OS: macOS Tahoe 26.5.2, as reported by the user.
- Result: “8 checks passed, no errors or failures.”
- Verification scope: awaiting clarification of whether this means the eight
  Rust unit tests or also the bundled app build/runtime, offline restart and
  reconnection checks. The sync destination (local fixture or hosted staging)
  has not yet been reported.
- Intel runtime and Mac performance measurements have not been reported.

This records the user's evidence without inferring unreported checks. Do not
mark Phase 1 complete or start Phase 2 until the required gate is established.

## macOS checklist for the user

Requirements: macOS 13.3 or newer, Xcode command-line tools, Node 24+ and Rust
1.90+. The old Swift/Sparkle app stays installed for rollback; Tauri initially
uses `app.base.personal.desktop` and the name **Base Desktop**.

Run the common checks above, then build your host architecture:

```sh
npm run desktop:build -- --bundles app,dmg
open 'apps/desktop/src-tauri/target/release/bundle/macos/Base Desktop.app'
```

For a universal Intel/Apple Silicon package:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run desktop:build -- --target universal-apple-darwin --bundles app,dmg
open 'apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos/Base Desktop.app'
```

Unsigned/ad-hoc local development builds are suitable for these checks. Public
distribution needs the owner's signing/notarization credentials; they were not
requested, generated, embedded or modified during implementation.

Record results for:

1. Launch with Wi-Fi disabled and the Vite/Next servers stopped. Create/edit/delete
   tasks, calendar events, projects/documents, notes, board items and list entries;
   restart and verify they remain. Use local workspace first, then a connected
   cached workspace to verify durable server-pending changes.
2. Start the isolated fixture, connect, check Keychain session persistence across
   restart, simulate an outage, edit, recover and verify outbox drainage. Verify
   account-scoped data survives sign-out/reconnect and stays separate from the
   anonymous local workspace.
3. Use a Vercel preview with **separate staging Redis/Blob credentials** to test
   actual Redis Lua/receipts, attachments, cookies and per-device sessions. Do not
   point outage/deletion tests at production records. Verify a Mac and Linux
   desktop using the same staging service exchange edits and review conflicts.
4. Open every route, project detail, command palette and shortcut sheet. Verify
   task subtasks, calendar recurrence, rich notes/locks/trash/graph/print, project
   files, vision drawing/undo/zoom, finance/focus and all three lists. Check cloud
   integration errors and cached offline views; separately test configured AI,
   MCP/OAuth, Cal.com, Blob, markets, news/social and metadata providers.
5. Verify native menus, `Cmd+K`, `Cmd+Shift+N/O/E`, sidebar/navigation toggles,
   `Control+Option+Space`, high-DPI/window resize, dark/light/system appearance,
   `base://open/tasks`, external URLs, native notification permission/delivery,
   workspace export, print dialog and graceful quit while local saves are active.
6. Record Mac model/chip, OS/WebKit versions, build target, checks, failures and
   screenshots. Do not call an Intel target “runtime tested” after only compiling
   it on Apple Silicon (or vice versa).

Send back this record, especially failed command output. macOS verification stays
pending until those results exist. A CI compile is additional evidence; the new
workflow has not been run remotely from this thread.

## Deployment, upgrade and rollback

- The hosted app/backend remain at the repository root; Vercel's configuration
  and legacy Redis, cookie, agent/MCP and widget keys remain available. Deploy the
  updated backend to staging before connecting new desktop builds. No deployment,
  production write, database reset or secret rotation was performed here.
- Existing Swift native snapshots remain in `Application Support/Base` or
  `Application Support/Bridge`. Tauri's SQLite is in the OS application-data
  directory under its separate identifier. Sync/export any pending legacy Swift
  edits before retiring that client; its JSON snapshot and old app are retained.
  Use Account & sync → Import workspace backup to select its JSON snapshot.
  This opens an isolated local copy and archives the complete original envelope.
  Connect the destination service, then choose Add selected offline workspace to
  account. ID collisions and old deletion intentions require review; missing
  records are never interpreted as deletion. The source file is not modified.
- Anonymous local workspace edits are isolated from cloud workspaces. Signing
  into a cloud service opens that service's cache; it does not upload an anonymous
  document over an existing account. Sign out to return to the retained local
  workspace. Choose offline workspace to select the retained local source, then reconnect
  the destination account and use Add selected offline workspace to account.
  Local source documents remain available after transfer.
- V1 Swift clients retain their existing operation/response contracts and
  unknown fields, but cannot provide v2 ancestors/conflict detection until phase 3.
- Server receipt/tombstone hashes are durable with no TTL; future compaction
  needs device acknowledgement/checkpoint rules. Resolved local conflicts remain
  archived. Integration/media cache is bounded and can be rebuilt; pending edits
  and conflict records are never evicted to satisfy cache limits.
- If local persistence fails, editing pauses and a full unsaved copy remains in
  memory for retry/export. It is not durable until a write succeeds or is exported;
  force-killing the process can lose that unsaved copy. Successfully saved outbox
  entries survive normal close and process termination.
- Signed updates require release-time `BASE_DESKTOP_UPDATER_PUBLIC_KEY` and
  `BASE_DESKTOP_UPDATER_URL`, plus Tauri's private signer key held outside the repo.
  Normal development builds show that updates are unconfigured. The legacy
  Sparkle feed and release/install scripts remain unchanged. Test the signed
  updater and establish its release feed before migrating existing Mac installs.
  Release builds must also pass `--config src-tauri/tauri.release.conf.json` to
  generate signed updater artifacts, with `TAURI_SIGNING_PRIVATE_KEY` and its
  password supplied securely by the release environment. Linux in-app updates
  require AppImage packaging; `.deb`/`.rpm` are updated through their package
  manager or replacement installer. macOS uses the signed app update archive.
- Keep the previous native app and backups through validation. Reverting the
  migration commits restores the old web/native source; additive session/receipt
  keys and SQLite do not replace or delete the production Base document.

## Notes privacy gate

The old UI contained a fixed password in shipped JavaScript. That credential
was removed without changing production credentials or note data. Web notes now
verify the existing Base account password through the normal login handler;
connected desktop notes use a salted PBKDF2 verifier stored only in Keychain or
Secret Service after successful login. Renew a pre-migration session once to
enable offline unlocking. Local workspaces can set their own note password in
Account & sync. The notes retain their existing plaintext storage format; this
is a privacy gate, not encrypted-note storage. The legacy widget credential
remains confined to the unchanged iOS source until its phase.

## Gate status

Linux implementation, builds and the functional checks recorded above are
verified. macOS runtime, real staging cloud/integration verification, signed
updates and the remaining native service checks remain pending. Phase 1 is **not complete**, and the redesign
and native iPhone modernization have not begun.
