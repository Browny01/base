# Native migration — phase gates and audit

## Scope and sequence

There are three phases: (1) locally bundled desktop and offline sync, (2) visual
redesign and measured optimization, (3) native iPhone modernization. A phase must
be implemented, tested, documented and committed before the next begins. macOS
and iPhone hardware verification cannot be performed on this Linux workstation;
those checks remain pending and prevent claiming the relevant phase complete.

## Repository audit (11 October 2026)

- `app/` is Next.js 16.2.7; its authenticated routes delegate to React page
  components. Only the project route requires server-side parameter unwrapping.
  `app/api/` hosts Redis persistence, native sync, MCP/OAuth, owner/agent autonomy
  controls, widgets, cron snapshots, Blob, news/AI, Cal.com, wallet/token/FX,
  market charts, TMDB, YouTube, social feed, live status and link metadata.
- `components/` already contains the complete dashboard, tasks/subtasks,
  calendar/recurrence, projects/milestones/documents/files/links, wiki with rich
  blocks/locks/trash/export/graph, vision canvas/drawing, finance/money/wallets,
  focus, news, shopping/reading/watch lists, settings and keyboard/command UI.
  Reuse these instead of duplicating business logic. Next Link/navigation and
  relative API requests are the client/server boundaries to extract.
- `lib/store.ts` defines all data, including habits/logs, exams/timetable/school
  notes/courses, goals/workouts/body metrics, social metrics/business KPIs,
  briefs/bookmarks and autonomy metadata even where there is no dedicated page.
  `lib/hooks.ts` currently hydrates and pushes whole documents using timestamps;
  it can overwrite offline/concurrent work. SQLite will replace this desktop
  persistence path. Existing web storage keys remain readable.
- Redis is a single deployment-scoped personal workspace, **not** an existing
  multi-user service. `base:data` and revision/history/password keys fall back
  to Bridge/Nexus aliases. `versioned-base-store.ts` provides revision CAS;
  autonomy writes protect execution leases and owner decisions. Keep those
  protections and unknown fields. No production database migration is needed.
- `/api/native/sync` currently supports 24 record collections, whole-record
  upsert/delete, no receipt ledger or conflict handling. Extend it with an
  opt-in v2 protocol; keep legacy Swift payloads and response shapes working.
- Authentication uses an expiring HMAC cookie and environment scrypt or stored
  PBKDF2 verifier. Secrets have legacy environment aliases. Desktop login will
  reuse password verification but issue revocable, per-device opaque sessions.
  Rust stores tokens in the OS credential store and performs allowlisted API
  requests, so tokens never reach JavaScript. Local data is scoped by verified
  service/workspace identity; expired sessions keep offline edits.
- `native/BaseCore/` preserves JSON and atomically writes a snapshot/operation
  queue; reconnect uses Network.framework. Existing Swift sync uses cookies and
  currently acknowledges a whole sent batch. Leave Swift changes for phase 3.
  `ios/` is SwiftUI plus WidgetKit. An existing widget has a source-embedded
  legacy token; do not copy it into desktop builds or reset production secrets.
- `macos/` currently loads the remote site through WebKit, uses shared SwiftUI
  offline fallback, Carbon shortcuts and Sparkle. Keep this release path until
  Tauri is validated on actual macOS. Preserve existing identifiers/feed. Ship
  Tauri initially with a separate desktop identifier to allow side-by-side
  rollback and deliberate migration of the local snapshot.
- `docs/` covers native installation, legacy contracts, calendar MCP and Hermes
  publishing. Existing scripts publish Sparkle releases and support an optional
  local AI relay; neither becomes a desktop runtime requirement. Env files are
  ignored and must never be bundled. Root Vercel deployment remains intact.
- Baseline: all 63 Node tests and TypeScript check pass. ESLint has 19 existing
  errors and 15 warnings (principally effect state updates); track separately
  from new changes. Linux has Rust, GTK 3, WebKitGTK 4.1 and Xvfb available.

## Implementation decisions

Keep `app/`, `components/` and `lib/` in place to preserve Vercel and existing
imports. Add an npm workspace at `apps/desktop` and a small `packages/sync`
contract/merge engine. Shared models/UI stay in their existing directories until
there is a concrete reason to relocate them. Vite bundles all React routes and
brand assets locally with route splitting; no Node server is shipped.

Rust owns a versioned SQLite document, baseline, outbox, conflict archive and
bounded integration cache. A local edit and its operations commit in one SQLite
transaction before the UI reports them saved. No arbitrary SQL, filesystem,
shell, credential-read or arbitrary authenticated HTTP commands are exposed.

V2 operations carry stable IDs and before/after values at JSON field or record
paths. Server CAS applies disjoint changes, detects divergent same-field edits,
and archives conflicts; deletes carry the old value so stale edits cannot
silently resurrect removed records. Durable receipt checks and data writes are
atomic. Download an unchanged-revision response when possible; send a full
snapshot on changed revision initially to remain compatible with legacy web,
MCP and cron writers. Retained conflicts have explicit local/server resolution.

Sync is triggered by committed edits, reconnect and foreground activation;
retry uses bounded exponential backoff and pauses while hidden. No idle poller.
Cloud integrations remain server hosted, with cached successful GET responses
available offline. Inline attachments remain durable; downloaded assets use a
bounded cache. Signing/updater keys are operator inputs, never invented.

## Rollback

Existing Next.js, SwiftUI, Sparkle, Redis keys and authentication contracts remain
available. SQLite migrations are transactional and fail closed on newer schemas.
Never delete the old Swift snapshot during import. Retain local outbox/conflicts
through logout or authentication expiry. Revert the migration commit to restore
the old deployment; v2 receipts and desktop sessions are additive Redis keys.

## Phase status

Phase 1: desktop/sync implementation and documented Linux functional checks are
implemented. The user reports eight passing checks on a MacBook Air M3 with
16 GB RAM, running macOS Tahoe 26.5.2. The scope of those checks is being
clarified; real staging integrations and signed-update validation remain pending.
Phase 1 is not yet
complete. Phase 2 and phase 3 have not started.
Actual results, hardware verification and remaining limitations will be recorded
here before any phase advances.


## Additional implementation findings

- Browser writes now share v2 operations with desktop. `base_sync_v2` atomically
  stores the document, ancestor, outbox and conflicts; Web Locks prevent tab
  races. The previous browser cache is retained and exportable. Newer pre-v2
  offline caches recover through conservative creates and explicit conflicts,
  rather than overwriting a cloud document by timestamp.
- Legacy full-document writers must match `dataRevision`. Stale snapshots receive
  a conflict error; generic MCP/agent/cron callers can reread and retry. The
  existing authenticated `/api/data?force=1` recovery contract still overrides
  that guard deliberately. Autonomy execution protections remain enforced.
- An authentication regression test exposed missing AES-GCM tag handling in
  the stored onboarding verifier. The Node verifier now reads the tag appended
  by Web Crypto, retaining existing verifier formats and stored passwords.
- Next.js and its lint configuration were updated from 16.2.7 to 16.4.0 after
  the dependency audit reported runtime advisories. Installed route/proxy docs
  were reread. Nonbreaking transitive updates were applied; no forced downgrade
  or production credential change was made.
- Desktop API/session credentials stay in Rust and Keychain/Secret Service.
  The user-entered briefing unlock password stays only in process memory on
  desktop; it is never persisted in WebKit session storage. SQLite files are
  owner readable/writable and their containing directory is owner only.
- Images from Vercel Blob and selected existing media providers use a bounded
  SQLite cache (32 MB total response/media cache). Other image hosts retain
  normal online rendering. Cached views display successful GET data offline;
  rejected authentication is never disguised as a successful fresh response.
- Large inline attachments use authenticated 750 kB byte chunks, SHA-256
  integrity verification and temporary Redis staging (seven-day TTL). The
  operation commits only when complete, and its receipt commits atomically.
  Requests remain under Vercel's body limit. No local attachment is deleted
  when upload staging fails or expires; individual operations are capped at
  32 MB and documents at 128 MB.
- Missing initial cloud revisions are handled explicitly with a full first
  pull, including legacy data at revision zero. Deletes retain tombstones and
  each outbox entry retains its originating revision across later batches.
  Deleted-parent conflicts preserve the full local record for explicit restore.
- SQLite commit failures pause editing, retain an unsaved copy in memory, expose
  retry/export, and prevent normal close/quit until local writes are flushed.
  Saved server-pending edits do not prevent closing: they already reside in
  SQLite and retry on the next launch.
- Tailwind v4 requires modern WebKit; desktop declares macOS 13.3 minimum and a
  Safari 16.4 frontend target. See [Tailwind compatibility](https://tailwindcss.com/docs/compatibility).

- Legacy Swift/browser/desktop backups can be selected with a native chooser.
  Each import opens an isolated local scope and archives its original JSON and
  queue. Adding it to a connected account uses conservative creates; ID collisions
  and legacy deletes require review. Existing local scopes and source files remain.
- The fixed password embedded in the old notes UI was removed from shipped React
  code. Locked flags/content are preserved; web uses the current account password,
  desktop keeps a salted offline verifier in the OS credential store, and local
  scopes can set their own note password. This documented security change does not
  rotate production credentials or change plaintext note storage.
- Expanded conflict tests cover default values absent from the cloud ancestor
  and archive both sides after browser conflict resolution. Page recovery keeps
  export/navigation available if malformed data prevents a page from rendering.
- Native runtime verification found that enabling Tauri's optional
  `freezePrototype` breaks D3's constructor assignment when Notes loads charts.
  It remains disabled, matching Tauri's default; CSP, narrow capabilities and
  unsafe-path/prototype-key rejection still apply. A dependency-loading regression
  test covers this configuration. See [Tauri security configuration](https://v2.tauri.app/reference/config/#securityconfig).
- Receipt fingerprints canonicalize JSON object keys so equivalent retries from
  different native serializers remain idempotent. Reusing an ID with changed
  values is still rejected. Startup preference reads tolerate unavailable WebKit
  storage; SQLite remains the primary data source.

## Verification record

The final evidence and outstanding hardware checks are tracked in
[Desktop verification](desktop-verification.md). A passing build or an isolated
HTTP fixture is never reported as a production integration or macOS runtime test.
The implementation is committed as `0057960` (`feat: add locally bundled Tauri
desktop with durable offline sync`). Keep the baseline `81f65be` available for
source rollback; no production deployment was performed.
