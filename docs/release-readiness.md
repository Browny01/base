# Base release readiness — 24 October 2026

Base 0.1.9 is a release candidate, **not a completed production release**. This
checklist supersedes stale status descriptions in older chronological reports.
The original three phases remain; Phase 2.5 is in progress, and Phase 3 has not
started. Empty GitHub Issues does not mean there is no outstanding work.

## Implemented and checked

- Shared Tauri/Vite and browser pages, durable offline record queue, SQLite /
  IndexedDB separation, field-aware conflicts, record-scoped Cloud writes,
  incremental downloads and recovery safeguards.
- Dashboard customization, Notes selection/paragraph fixes, rich page copying,
  composed emoji/image icons, habits/streaks, list tags and combined filters.
- First-run preferences/profile, accounts, local/remote/Cloud workspace UI,
  sharing permissions, billing entitlements and integration-key handling.
- Cloudflare hourly cleanup index/query fix; historical measurement and rollback
  are in [d1-hourly-read-fix.md](d1-hourly-read-fix.md).
- October runtime/dependency remediation and publication sanitization; see
  [security remediation](security-remediation-2026-10.md). Never archive private
  rollback directories, local credential stores or untracked files for release.
- GitHub CI passed for the previous 0.1.8 checkpoint on Linux, Apple Silicon,
  Intel Mac, the dependency-security job and the iOS simulator/widget build.
  This is build coverage, not physical-device or installer acceptance.
- Local 0.1.9 checks: 195 JavaScript tests, four TypeScript checks, ESLint
  (zero errors; four existing warnings), Worker dry-run and browser build pass.
  The independent workspace's nine Rust tests and the desktop's 12 tests plus two
  archive regressions pass. Native desktop tests include
  database, transport, archive and updater regressions; current CI is the source
  of truth for the new cross-platform candidate.
- Browser inspection confirms the complete sidebar icon at 28 px, no crop or
  transform, and a transparent CSS backing. The source PNG and generated web
  icons retain alpha; the dark rounded tile belongs to the supplied artwork.

The Linux AppImage and DEB built locally. The AppImage launched and restarted
with a retained synthetic habit/check-in in a network namespace without external
network access. This is an offline package smoke test, not DEB installation,
Cloud synchronization or a performance benchmark.

## Distribution preparation

`.github/workflows/desktop-release.yml` is manual and creates a **draft preview**
only after every platform build succeeds. It collects:

| Platform | Downloads |
| --- | --- |
| Source | `Base-<version>-source.zip` from tracked Git files |
| Apple Silicon | `*_aarch64.dmg` |
| Intel Mac | `*_x64.dmg` |
| Windows x64 | NSIS `*.exe` installer |
| Linux x86-64 | `*.AppImage` and Debian/Ubuntu `*.deb` |
| Integrity | `SHA256SUMS.txt` |

DMGs are now actually uploaded; the older workflow built them but only retained
updater archives. The draft must never replace an existing published release.
The default run does **not** publish the updater feed or require unconfigured
signing secrets. The separate `publish_updater` option requires all signed
artifacts and protected release credentials; it is not a shortcut past acceptance.
Updater signatures prove release authenticity but do not provide Apple Developer
ID notarization or Windows Authenticode signing.

Windows packaging now includes `.exe` sidecars, Windows Credential Manager and
a fixed per-user Scheduled Task with a limited interactive principal. The task
continues after the UI closes, optionally starts at login and has bounded crash
restarts. It uses the existing loopback-only Rust/SQLite server. Normal Stop uses
an authenticated host-control session and event-driven graceful shutdown; an
ordinary workspace session cannot stop it. No secret is put in task arguments.
Windows file writes no longer attempt POSIX directory fsync. A running Windows
service executable cannot be replaced in place; stop the workspace before
upgrading its service binary. The scheduled task runs only while its user is
logged in; it is not a machine-wide privileged Windows service.

## Gates before a public production release

- **Clerk / Stripe:** create and verify production configuration, DNS, email /
  Google sign-in and callbacks, session expiry/revocation and live billing
  configuration. Existing real sandbox checks do not validate live billing.
  Do not expose sandbox plans as real subscriptions. No paid hosting upgrade is
  authorized. Provider secrets must be entered privately.
- **Legacy data:** snapshot and inventory all legacy keys, files and credentials;
  map ownership; test a representative import with checksums and rollback.
  Existing Vercel/Upstash/Blob data has not been migrated. Switching a hostname
  does not migrate an account or its data. Retain a separately reachable legacy
  deployment before cutting over its existing hostname.
- **Workspace acceptance:** real two-device offline edits/restart/reconnect,
  concurrent conflicts, switching/import/export, private attachments, permission
  changes and revoked sessions. Large real workspaces must stay inside Free
  Workers CPU and D1 read limits; unit fixtures are not a capacity guarantee.
- **Missing functionality:** durable offline file-payload uploads/idempotent
  receipts, complete attachment-inclusive recovery/export/import UI, standalone
  local integration parity and remaining legacy widget/agent contracts. The
  detailed [Phase 2.5 checklist](phase-2.5.md) remains open.
- **Installers and updates:** test actual Mac DMGs (Apple Silicon / Intel where
  available), Windows installation / Credential Manager / Scheduled Task /
  notifications / UI-close persistence, and Linux AppImage/DEB upgrades. Test
  a signed previous-to-new updater release with retained records and outbox.
  No Apple Developer account/certificates or Windows signing identity is
  configured; unsigned/ad-hoc previews need explicit OS security approval.
- **Performance and recovery:** repeat documented measurements on target
  hardware, exercise crash/interruption and login restart, profile large notes,
  files and boards, and verify backup restoration. Older Linux measurements
  cannot stand in for Mac/Windows measurements.
- **iPhone:** the existing SwiftUI client is preserved. New workspace contracts,
  redesign and actual iPhone/WidgetKit acceptance belong to Phase 3. The current
  mobile landing image represents the responsive browser app.

Publishing a source commit, preparing draft installers and connecting a preview
hostname do not complete these gates. Do not label the release production-ready
or mark the entire roadmap complete until the evidence exists.

## Domain transition

Requested hostname: `https://base.lucasbrown.xyz`. Before the requested cutover, its CNAME
resolves to `543d8cfbde0c15de.vercel-dns-017.com`. Cloudflare OAuth can inspect
Worker domains/routes, but the DNS-record API returned code 10000 (not authorized)
and direct D1 status checks returned code 7403. No database reset is an answer to
these permission failures.

The Worker supports explicitly configured `PUBLIC_ALIASES` during a transition.
Each request uses its matched, allowlisted origin for browser CSRF checks, Clerk
JWT authorized party, MCP metadata and generated callbacks. Wildcards, forwarded
Host headers and arbitrary client origins are not accepted. Existing attachment
URLs can still be deleted through either configured origin, subject to workspace
ownership. Uploads retain a canonical workers.dev file URL so installed clients continue
to recognize private attachments. New browser clients resolve those file IDs
through their own origin and authenticated workspace session, with an 8 MB image
read limit; download links use the same allowlisted mapping. Public images keep
their ordinary browser cache. No cross-origin credential forwarding is used.

The legacy workers.dev origin must remain available for installed
clients, existing device flows, webhooks, file URLs and signed MCP resources.

Changing origins creates a new browser cookie/IndexedDB scope: users must sign
in at the new URL. Unsynchronized browser edits at the old origin must be drained
or exported first; never copy or merge browser databases silently. Existing
native scopes should remain connected to their saved origin until deliberately
reconnected. A custom domain does not rename or copy D1/R2 resources.

Before deployment, save the previous Worker version, bindings and DNS state
privately. The existing Vercel deployment must remain independently accessible
for legacy data. Keep provider webhooks on their working origin until their
new endpoints have been verified. If migration/production prerequisites are not
met, a custom domain may only be advertised as a preview with clear status.

### Live cutover blockers found during this check

- The custom hostname currently returns Vercel **404**; the independent URL in
  the last GitHub deployment returns **410**. An available legacy deployment
  cannot be assumed. The source and provider data have not been deleted or reset.
- Cloudflare rejected custom-domain registration with **100117**: an externally
  managed CNAME must be removed first. The current OAuth token cannot edit DNS;
  its DNS API request returns **10000**. The dashboard browser is not signed in.
  The owner must remove only the `base` CNAME pointing to
  `543d8cfbde0c15de.vercel-dns-017.com`, or provide narrowly scoped DNS access.
  No other DNS record should be touched. Then attach the custom domain, verify
  HTTPS, sign-in and private-file behavior, and persist the exact hostname route.
  The normal Wrangler config omits this still-blocked route so staging deploys
  continue to succeed. `PUBLIC_ALIASES` is ready; no DNS change is claimed.
- The installer matrix produced all four platform outputs. GitHub denied the
  workflow token's release-creation request (**403**, despite `contents: write`).
  The connected owner CLI successfully created a private draft for `v0.1.9`.
  No public release or updater publication occurred. For subsequent versions,
  precreate a draft with the owner CLI before dispatching the workflow; do not
  put a broad personal token in Actions to bypass the restriction.
- An Intel CI run counted first-time Rust compilation inside the standalone
  service runtime test's two-minute budget and timed out. Compilation now has a
  separate bounded setup hook; the runtime test retains its two-minute timeout.
  New runs must validate that fix instead of treating the failed run as passed.

Owner draft preparation (after a version bump and appropriate checks):

```bash
gh release create v0.1.9 --draft --prerelease --target "$(git rev-parse HEAD)" --title "Base 0.1.9 preview" --notes-file docs/release-notes-0.1.9.md
gh workflow run desktop-release.yml --ref main -f publish_updater=false
```

The draft already exists for 0.1.9; do not recreate or publish it blindly. Any
failed publication job can be retried after fixing access, without rebuilding
successful platform artifacts. Public publication still requires the acceptance
checks above.
