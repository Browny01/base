# Phase 2.5 — Accounts, workspaces and managed sync

Inserted at the owner's request after the accepted Phase 2 interface and before
original Phase 3 (native iPhone). The original three-phase roadmap is preserved.
**This is a verified implementation checkpoint, not a completed phase or a
production cutover.** Live identity/billing, remaining integration adapters,
large-workspace migration and actual macOS acceptance remain release gates.

## Implemented

- `native/BaseWorkspace`: independent Rust/Axum process, loopback-only listener,
  SQLite WAL/FULL transactions, versioned migrations, hashed passwords,
  revocable hashed per-device sessions, durable receipts, tombstones, guarded
  automation, conflict preservation, restart recovery and private attachments.
  Stopping never deletes records. HTTP is allowed only for explicit loopback;
  a remote deployment needs an HTTPS reverse proxy (`--public-url`).
- Tauri manages a fixed user systemd/launchd service. A private, atomically copied
  executable survives AppImage unmount and UI exit. OS credentials never reach
  JavaScript. Login startup is optional; start/stop is separate from UI exit.
  Commands cannot run arbitrary programs or access arbitrary filesystem paths.
- Accounts & Sync has Local/Cloud modes, run/connect choices, secure URL/password
  connection, service health/usage/startup controls, browser-based Clerk device
  approval, plan/storage/device details and integration revocation. Workspace
  changes require explicit separation; existing scope data, outboxes and
  conflicts remain intact. Copy/import is separate and confirmed.
- `apps/cloud`: Workers APIs; D1 tenant-scoped records, accounts, device grants,
  revision CAS, operation receipts and billing; private R2 files and immutable
  recovery archives; KV disposable caching; SQL job outbox with Queues, leases,
  retries, dead-letter queue and hourly cron. Four additive migrations have
  been applied to the **new staging database only**.
- Clerk signature/issuer/origin verification, owner-derived workspace identity,
  short device approval proofs and single-use exchange; desktop sessions go to
  the OS credential store. Verified account deletion revokes access while
  retaining records; stale webhooks cannot recreate deleted accounts.
- Stripe hosted Checkout/Portal, pinned API version, signed and deduplicated
  webhooks, authoritative reconciliation and guarded concurrent billing state.
  Free: 250 MB, two syncing devices, seven-day recovery. Plus: USD $3.99/month,
  10 GB, unlimited devices, 90-day recovery. Upload limits are 10/100 MB. Expiry
  does not delete data or block export/account management. Over-limit devices
  retain their offline edits and can revoke an older device to regain a slot.
- Existing 35 MCP tools are extracted into `packages/server`, retaining note
  privacy, calendar, vision, finance, collections, briefings and automation
  protections. D1 writes use revision guards instead of stale full replacements.
  External integrations have owner-approved PKCE S256 grants, resource-bound
  hashed access tokens, rotating refresh tokens with replay revocation and
  explicit disconnect. Integration grants do not consume desktop device slots.
  Legacy Vercel MCP authentication remains unchanged at its existing endpoint.
- Existing market/FX/wallet/news/YouTube/TMDB/social/live-status/Cal.com handlers
  are reused by Next and Worker adapters. RSS uses fetch/parseString rather than
  Node HTTP. Cloud AI briefing requests use the existing model logic, require a
  caller-provided key and cache only under the authenticated workspace. Caller
  keys are never written to the cache or used as plaintext cache identifiers.
- A read-only legacy export performs one MGET of current/compatibility data,
  revision and history keys, without reading authentication keys or backfilling
  storage. Its checksummed archive preserves unknown fields and inventories
  exact legacy Blob URLs. Empty-workspace import archives both sides; rollback
  refuses a different owner, damaged archive or any post-import edit.
- Dashboard cards pack independently; the taller calendar leaves no extra gap
  below Tasks Left/Revenue. Saved widget dimensions/order are retained. Workspace
  confirmations trap focus, start on Cancel and restore the invoking control.

See [website, integrations and notification update](phase-2.5-improvements.md)
for browser sync/security tests and the latest interface fixes.

## Verified on Linux, 2026-10-12

Hardware: AMD Ryzen 5 5600G, Arch Linux x86-64, GTK 3.24.52/WebKitGTK 2.52.6.
Runtime screenshots use Xvfb/X11 with software rendering, not a Wayland/GPU or
battery measurement. Node 25.9 and Rust 1.98 are build/test tools, not installed
application runtime dependencies.

- All 148 JavaScript tests passed. Root, desktop, browser and Cloud TypeScript checks; Next production build; ESLint
  (zero errors, four pre-existing warnings); Vite/Tauri release build with
  `.deb`, `.rpm` and AppImage; Rust formatting and Clippy with warnings denied.
- Standalone service: nine Rust tests. Desktop: ten Rust tests. JavaScript tests
  cover migration integrity, actual Rust HTTP authentication/restart/files,
  synchronization, conflict/retry/rollback, tenant isolation, Clerk signature
  fixtures, Stripe lifecycle fixtures, device downgrades and MCP OAuth replay.
  The test runner output is the authority for the current aggregate count.
- Real deployed Workers/D1/R2 smoke checks: offline-outbox replay, idempotent
  receipts, separate tenants, retained concurrent conflict, private files,
  reset recovery without acknowledgements, device revocation, multiple MCP
  writes in a request and rotating/replayed resource-bound grants. Synthetic
  fixture sessions/approvals bypass Clerk provisioning; this does **not** verify
  live Clerk sign-in or Stripe. Fixture SQL/R2 objects are cleaned up.
- Actual native UI: dashboard with short metrics and taller calendar; Local/Cloud
  settings in light/dark; fresh unloaded-unit startup; UI stop/restart; OS-keyring
  connection; login-start unit enable/disable; service continuing after UI quit;
  forced service crash and restart with the same workspace identity (5.52 s).
  The packaged AppImage also launched through FUSE; its mount disappeared on UI
  quit while the private service remained healthy and could restart independently.
  A real new login and Wayland remain pending.
- Settled service with UI closed: 30 s sample, stable process, 0.0% of one CPU
  core at `/proc` tick granularity, RSS 6.31 MiB, PSS 3.74 MiB. This measures a
  small idle workspace, not large sync throughput, UI memory, battery or macOS.
  Packaged UI + its two WebKit descendants, Settings open with a small workspace:
  another 30 s sample measured 0.033% CPU, RSS 544.06 MiB and PSS 298.61 MiB.
  RSS includes shared mappings in multiple processes; PSS apportions them. This
  software-rendered X11 result does not establish Mac memory usage.
  Raw results: [performance](performance/desktop-phase25/).
- Native screenshots: [visual checks](screenshots/desktop-phase25/).

## Staging and remaining gates

The latest onboarding/profile/shared-note-password checkpoint is documented in
[onboarding and account checks](phase-2.5-onboarding.md): 153 JavaScript,
11 desktop Rust and nine workspace Rust tests pass. Linux packaging and actual
native/browser staging checks pass within that report's stated limits. Mac and
production verification are still pending.

Staging is **https://base-cloud-staging.kingbrownyplayz.workers.dev**. D1/R2/KV,
queues and cron are provisioned. The owner enabled R2 and configured Clerk
Development and the Stripe sandbox through the private helper. Provider checks
are recorded in [staging acceptance](phase-2.5-staging-checks.md). Follow
[private setup](cloud-setup.md); do not paste secrets in chat.
`base.lucasbrown.xyz`, Vercel/Upstash/Blob production data,
legacy secrets and existing Swift clients have not been switched or reset.

Before marking Phase 2.5 complete:

1. Finish local-service integration adapters (currently unsupported integration
   endpoints return a clear 501),
   link-preview/favicon, legacy agent/widget compatibility and recovery UI.
   Finish durable offline file uploads and idempotent upload receipts; existing
   JSON outboxes protect record edits, not a failed upload's entire file payload.
   Cloud Cal.com/X credentials now have tenant-scoped encrypted storage; real
   owner provider accounts still need acceptance checks. Local desktop integration
   requests currently use the fixed hosted adapter, so a standalone Rust service
   alone does not supply all external provider endpoints.
2. Finish provider acceptance beyond the isolated staging account: email/Google
   interactive sign-in, expiry, webhook retries/order and downgrade recovery.
   Apple is disabled in the current Clerk instance; Development can use Clerk's
   shared credentials, while production needs an Apple Developer account.
   See the staging acceptance report for the real provider flows already tested.
3. Verify two actual desktop devices against staging: independent offline edits,
   restart, reconnection, conflicts, protected files and workspace switching.
   Test the service on actual macOS, including UI quit, crash recovery, login
   startup, Keychain and signed packaging. Mac tests from Phase 2 do not verify
   this new background service or billing/login code.
4. Finish a complete file/credential migration and legacy-owner mapping, prove
   source/target checksums and rollback with a representative copy, then arrange
   an explicit production cutover. The read-only exporter has **not** been run
   against production. JSON exports currently contain file references, not an
   archive of every attachment's bytes.
5. Profile large notes/documents, recovery storage amplification and native file
   upload buffers. Protocol 2 still returns whole snapshots; an entire near-quota
   document can exceed Worker memory even though R2 files fit the storage plan.
   Staging fixtures do not establish production capacity. Test peak memory,
   database batching and migration limits before enabling general signup.
6. Verify packaging/signing/updater rollout, actual platform performance and
   backups/recovery under interruption. Keep the old deployment available until
   compatibility and rollback are demonstrated. Phase 3 has not started.

## Rollback boundaries

The existing Vercel deployment remains the production rollback path. No live
personal data was moved. New staging migrations are additive; do not edit an
applied migration or drop tables to roll back code. Use a new migration instead.
Desktop scopes and migration archives survive switching/sign-out. Standalone
SQLite rejects a newer unknown schema rather than resetting it. Retain source
archives and attachment manifests until a complete migration has been verified.

## References consulted

- [D1 transactions and limits](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/)
- [Clerk JWT verification](https://clerk.com/docs/reference/backend/verify-token)
- [Stripe webhooks](https://docs.stripe.com/events/manage-webhook-endpoints)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [PKCE](https://www.rfc-editor.org/rfc/rfc7636)
