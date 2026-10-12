# Website, integrations, news and notification fixes

Implemented on 2026-10-12, on top of the existing Phase 2.5 checkpoint. This does
not restart the roadmap or mark Phase 2.5 complete. Production data, Vercel
hosting, credentials and `base.lucasbrown.xyz` DNS remain unchanged.

## What changed

- Settings → News & integrations now has masked save/remove controls for TMDB,
  Cal.com, X and optional CoinGecko Demo keys. Public RSS, Reddit, YouTube and
  market feeds need no user key. Existing Gemini/OpenAI/Anthropic/Perplexity
  briefing keys retain their encrypted vault; both the News and Dashboard
  briefing use the chosen, explicitly unlocked key. Local desktop credentials
  use the OS keyring. Cloud credentials use tenant/provider-bound AES-GCM in a
  separate D1 table, and are excluded from record sync, exports and KV caches.
  Status endpoints expose configured flags, never secrets. The provider
  registry is extensible; Google Calendar OAuth is future work, not a pretend
  connection or an implemented calendar provider.
- News renders public feeds and markets without requiring a Cloud account.
  Requests have timeouts, useful errors and cached fallbacks. Crypto charts
  can use a personal CoinGecko Demo key; Yahoo Finance provides real crypto
  quotes if CoinGecko is unavailable. Index prices use points and daily changes;
  currency quotes show their actual currency if FX fails. Charts avoid animation.
  Settings has publisher selections and one source form with URL/handle
  parsing, duplicate checks, categories and labelled remove controls.
- `apps/web` serves a lightweight landing page inspired by the inspected Pulse
  reference and a browser edition of the shared desktop React UI. No duplicate
  productivity pages or permanent Node server. Open the
  [staging website](https://base-cloud-staging.kingbrownyplayz.workers.dev/) or
  [browser workspace](https://base-cloud-staging.kingbrownyplayz.workers.dev/app/).
  Browser records/outboxes use atomic IndexedDB commits, revision guards,
  recovery archives and isolated workspace scopes. Sign-in uses Clerk and a
  Secure/HttpOnly/SameSite=Strict session cookie; mutations validate Origin and
  every account request carries the selected workspace to prevent cross-tab
  account changes from contaminating a cache. The service worker caches public
  UI assets only. Authentication is loaded on demand; account/API responses are
  never placed in the service worker cache. Browser local workspaces do not run
  the Rust background service: that remains a desktop capability.
- Notifications now request permission, await the native notification command,
  offer a test alert and show permission/delivery errors. Focus completion uses
  the same adapter. Native desktop permission reporting alone cannot confirm
  macOS banner delivery; the UI points users to system notification settings.
  Focus alerts require Base to be running; no background alarm scheduler was
  introduced.
- The Cloud Service URL editor is removed. Desktop builds read a fixed release
  origin from `packages/core/src/service.json`; browser Cloud uses its own
  origin. Remote Local Workspace URL/password entry remains available.

## Verification

Linux host: AMD Ryzen 5 5600G, Arch x86-64, GTK 3.24.52/WebKitGTK 2.52.6.
Native screenshots use Xvfb/X11 and software rendering. No new RAM, battery or
startup benchmark is claimed by this focused update.

- 148 JavaScript tests passed, including encrypted credential isolation,
  fail-closed storage, cookie origin/workspace isolation, real browser-device ID
  validation, personal TMDB key forwarding, market fallback, notification
  permission/error behavior, browser outbox/revision guards, conflict/recovery
  retention and briefing keys never calling a provider while missing/locked.
- Root, desktop, web and Cloud TypeScript checks passed. Next and both Vite
  production builds passed. ESLint: zero errors, four existing warnings.
- Desktop Rust: ten tests; standalone workspace Rust: nine tests. Rust formatting
  and Clippy with warnings denied passed. Linux `.deb`, `.rpm` and AppImage
  production bundles built successfully.
- Actual Linux release app showed 44 headlines, stocks/index quotes and crypto
  charts without a Cloud account. A unique test scope saved/removed a TMDB
  credential through OS storage; the value was absent from SQLite files. The
  test-notification native command completed. Cloud settings showed sign-in
  without a URL input. These checks did not alter the owner's local workspace.
- Actual deployed staging browser: local task survived reload; a real isolated
  Clerk Development account obtained a browser session and separate Cloud
  workspace. A simulated `navigator.onLine=false` transition queued a Cloud
  edit, reconnection synchronized it, and reload retained the record. This was
  a simulated connectivity transition, not a physically disconnected browser
  reload. The service-worker offline/network-loss reload needs that final check.
- Browser TMDB save/status/remove exercised the real encrypted D1 credential
  endpoints. Only a fixture key was used: live TMDB/Cal.com/X/CoinGecko personal
  accounts still require the owner's own provider credentials for acceptance.
- Temporary Clerk account, derived D1 fixture rows and two owned R2 recovery
  objects were deleted. The normal Worker was restored and its temporary test
  secret/route removed. No production account or subscription was changed.

## Rollout and remaining gates

Migration `0004_integration_credentials.sql` is additive and applied only to
staging. `scripts/configure-integration-storage.mjs` initializes an absent
Worker encryption key privately and preserves an existing one. Do not rotate
that secret without a tested decrypt/re-encrypt migration and rollback; retain
it securely alongside D1 backups. Native OS key entries are scoped by workspace.
Legacy Vercel integration/environment contracts remain intact. The new private
credential endpoints are on the Worker, not the old Vercel backend.

The website currently uses Clerk Development and Stripe sandbox. General
production signup, live billing and the custom-domain cutover remain gated by
[Phase 2.5](phase-2.5.md). External integration requests from a local desktop
currently use the hosted adapter; direct Rust integration parity is still
pending. Browser API-response caches have a four-megabyte entry limit and a
40-entry bound across cached responses; site-storage quotas/eviction remain browser
controlled. Record storage is versioned IndexedDB, not an unlimited durable
filesystem. Large-workspace/file-upload and migration acceptance remain open.

Actual macOS builds/runtime, Keychain and notification banners must be checked
on the owner's Mac. Follow [Mac quickstart](phase-2.5-mac-quickstart.md). Phase 3
has not started. Screenshots are in `docs/screenshots/desktop-improvements/`.
