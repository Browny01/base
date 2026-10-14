# Phase 2.5 — reliability, preferences, Notes and desktop releases

Verified 14 October 2026. This preserves the existing roadmap; Phase 3 has not
started. Production Vercel/Upstash and `base.lucasbrown.xyz` are unchanged.

## Base 0.1.4 — reported Cloud sync SyntaxError

The owner's Mac trace `json@[native code]` at
`store-BJSA22lX.js:2:5396` maps exactly to `.json()` on an unsuccessful
`/api/native/sync` response in the 0.1.3 bundle. The owner confirmed Base Cloud
was selected. A non-JSON error body masked the HTTP failure with SyntaxError;
the trace alone does not establish the original HTTP status or upstream cause.

Desktop and legacy browser sync now share a response reader that reports the
HTTP status, safely retains JSON server error details, and rejects unreadable,
empty or non-object acknowledgements before persistence. Existing protocol,
workspace identity, revision and operation validations still run. No invalid
response can acknowledge pending operations or advance the local cursor.

Regression checks cover native response conversion with HTML 502, text 429,
malformed 200 and empty 204 bodies, plus null/array/string JSON and server JSON
errors. The browser sync persistence test verifies exact document/outbox retention
on failures and successful retry once a healthy response returns. All 163
JavaScript tests, root/desktop/web type checks and changed-file ESLint passed.
The live unauthenticated Cloud sync endpoint returned the expected JSON 401;
this is an authentication boundary check, not an authenticated Mac sync test.
Mac verification and diagnosis of the underlying intermittent Cloud HTTP failure
remain pending. No production data or credentials were changed.

### Follow-up: temporary HTTP 503

On 14 October the owner reported an unreadable HTTP 503 from Base Cloud, then
confirmed a manual retry succeeded without reinstalling or changing settings.
The independent remote staging fixture suite passed queue replay, receipt
idempotency, account isolation, retained conflicts, private R2 files, rollback
recovery, device revocation and MCP grant/replay checks. A bounded live tail
observed seven fixture sync calls returning HTTP 200 and no failing sync calls.
Synthetic fixtures were cleaned up; production data was not accessed. Clerk
and Stripe were not exercised by this suite. The original 503 was not captured,
so its underlying cause remains unconfirmed; no speculative service or data
changes were made. Historical telemetry querying was unavailable with the
CLI's current permissions.

## Priority order

Most important, implemented first:

1. Recover News/Settings after adding a YouTube source.
2. Investigate the intermittent Notes SyntaxError and prevent unsafe selector,
   link and paste operations from causing browser errors.
3. Restore native notifications and surface delivery failures.
4. Configure signed in-app updates with check/download/restart controls.

Less important, implemented afterward:

1. Market currency selection in onboarding and Settings.
2. News-feed selection in onboarding and Settings.
3. Searchable internal note links and formatted clipboard paste.
4. Replace the packaged bridge logo with the current Base house logo.

## Changes

- `normalizeNewsPrefs` repairs partial older/synced preference objects on shared
  loading and source mutations. Missing arrays receive defaults; explicitly empty
  arrays remain empty. YouTube channels and unknown fields remain retained.
  This is an additive repair, not a production data reset.
- Currency preferences support AUD, USD, EUR, GBP, CAD, NZD, SGD, JPY, CHF, HKD,
  INR, CNY, BRL, KRW and ZAR. The existing market handler converts monetary quotes
  and history with the same current real FX rate. Indices remain points and
  commodity units remain attached. If FX is unavailable, the original currency
  stays labelled and a conversion-unavailable note is returned; no invented rate.
- Feed toggles cover headlines, YouTube, Reddit, X and live creators, alongside
  publication/channel selection. Disabled sources remain stored, are omitted
  from requests, and their feed sections are hidden. Settings and onboarding
  reuse the same controls. News preferences are workspace-synced.
- The Notes link dialog searches other untrashed notes, shows four per page,
  and supports previous/next controls. Links retain the existing `#wiki:` format
  and locked notes keep their normal unlock gate. URL validation rejects unsafe
  schemes. Link insertion uses DOM ranges, preserving selection/formatting.
- Paste rebuilds an inert, bounded HTML fragment. Bold, italic, underline,
  strike-through, text/highlight colors, supported sizes and safe links survive;
  scripts, handlers, frames, media and unsafe URL/CSS values are removed. Code
  blocks remain plain text. Direct DOM range insertion avoids browser-specific
  `execCommand('insertHTML')` behavior. The editor's own undo/save path covers
  paste, including nested editable fields. Oversized rich HTML is rejected before
  existing text is removed. Plain text newlines remain supported.
- Native API responses with status 204, 205 or 304 now construct a null body;
  browsers reject even an empty typed-array body for those statuses. Regression
  tests reproduce that constructor failure and verify UTF-8/cache behavior.
- The table-of-contents lookup compares block IDs directly instead of
  interpolating arbitrary IDs into CSS selectors. Stale link ranges are checked
  before applying edits. Syntax errors from saved/synced operations, uncaught
  exceptions and unhandled promises expose a copyable
  stack trace, with URL query strings removed, in an in-memory toast; it is not
  uploaded. Typing/block insertion/paste passed on Linux, but the owner's
  intermittent Mac error has **not** been reproduced or conclusively diagnosed.
- Native notification commands bound message size and return delivery errors.
  Linux uses the already-present notify-rust library directly, avoiding the
  plugin's swallowed delivery errors. macOS uses the small platform-only
  mac-usernotifications wrapper over `UNUserNotificationCenter`, querying and
  requesting actual OS authorization. Normal Mac bundles receive ad-hoc signing
  for local notification support; this is not Apple Developer notarization.
  Focus completion failures now appear as feedback instead of being swallowed.
- ICNS, ICO and PNG desktop icons are generated from
  `public/base-icon-rounded.png`; browser/PWA icons use that same house logo.
  Existing iPhone/legacy Swift application assets have not been migrated here.

## Signed updates

Base 0.1.3 includes a pinned public key and HTTPS staging release feed. The private
signer remains outside the repository at `~/.config/base-release/updater.key` on
this development machine. Back it up privately; do not rotate it casually or
include it in a desktop/source archive. No server/provider secrets enter builds.

Settings → Accounts & Sync → App updates provides **Check for updates**, then
**Update & restart**, download progress and automatic restart. Writes flush
before installation; unsaved edits block installation. A focused progress dialog
locks editing/navigation during the update so new text cannot be lost at restart. Durable pending operations
are retained. Failed downloads remain retryable. Signature verification is
mandatory. Linux in-app updates use the AppImage edition; DEB/RPM use their
package manager or replacement installer. macOS consumes a signed app archive.

The read-only Worker routes serve only `desktop-releases/` artifacts from the
separate `base-desktop-releases-staging` R2 bucket (`RELEASES` binding). Release
CI credentials can be scoped to this bucket without access to tenant attachments.
Missing platforms return 204. The local publisher verifies artifact and trusted
comment signatures against the pinned key before uploading, rejects replacing a
published version with different bytes, uploads binaries first, and promotes the
manifest last. Previous version artifacts remain for rollback. Publish all
available platforms together; do not overwrite a manifest with one omitted.

```bash
# On the release machine, with the signer file supplied privately:
TAURI_SIGNING_PRIVATE_KEY="$HOME/.config/base-release/updater.key" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD='' \
npm run desktop:build -- --config src-tauri/tauri.release.conf.json

node scripts/publish-desktop-release.mjs \
  linux-x86_64=apps/desktop/src-tauri/target/release/bundle/appimage/Base_0.1.3_amd64.AppImage
```

The version must be bumped before a different binary is published. Normal source
builds can consume verified updates without possessing the private signing key.
Older checkpoints without the pinned configuration need one manual installation
of this checkpoint first.

`.github/workflows/desktop-release.yml` can build Linux, Apple Silicon and Intel
Mac releases, then publish all platforms after builds pass. It is manual, uses
an optional protected `desktop-release` environment and needs privately configured
GitHub secrets: `BASE_UPDATER_SIGNING_KEY`, `BASE_UPDATER_SIGNING_PASSWORD`,
`CLOUDFLARE_RELEASE_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. The Cloudflare token needs R2
access to the release bucket. These CI secrets/workflow have **not** been configured
or run remotely, and main has not been pushed. Actual Mac archives still need to
be built, signed and published before Mac users can receive a new release.

The initial 0.1.1 release copies in the older staging attachment bucket are
retained temporarily for Worker rollback. New releases and CI use only the
dedicated release bucket. Do not delete tenant files during release cleanup.

## Verification and limits

- 161 JavaScript tests; 11 desktop Rust and nine workspace Rust tests pass.
- Root/desktop/web/Cloud types, Rust formatting and Clippy pass. ESLint has zero
  errors and four pre-existing warnings. Next.js, Vite, Worker and Linux Tauri
  builds pass; DEB, RPM and AppImage artifacts and signatures were generated.
- An isolated Linux native workspace with only a YouTube preference array opened
  both Settings and News. Ordinary Notes typing and Enter-created blocks persisted
  in SQLite. The test alert was observed at the desktop notification service.
  This proves the system service received it, not macOS banner delivery.
- Native WebKitGTK paste also retained bold/color in SQLite and removed unsafe
  HTML.
- Actual browser component checks verified four-result note pagination, an
  internal link saved/opened the chosen note, formatted paste retained bold/color,
  unsafe pasted content was removed, and block insertion saved. Partial source
  settings rendered and currency changes preserved the source and repaired arrays.
  The update lock blocked existing/new portal content, held accessible focus and
  restored prior inert states on failure/cleanup.
- Live staging public market requests returned USD/EUR monetary quotes with
  indices in points. Account-only routes still reject anonymous requests.
- A signed Linux 0.1.1 release was published to staging. The isolated AppImage
  fixture upgraded from 0.1.0 through the two UI controls and restarted. Its bytes
  matched the signed 0.1.1 artifact, and the entire SQLite document and four
  pending operations were unchanged across installation. A second fixture
  upgraded through the guarded UI to 0.1.2, restarted, matched the downloaded
  signed artifact, and retained its complete document and six pending edits.
  The final 0.1.2 → 0.1.3 update also retained all six edits and matched the
  signed 0.1.3 artifact.

Linux runtime used X11/Xvfb and WebKitGTK on this development machine. Browser
checks used isolated component fixtures, not a new Clerk acceptance account. No
new benchmark numbers are claimed. Actual Mac/Windows runtime and Mac update/
notification delivery remain pending. The intermittent Notes SyntaxError remains
an investigation until reproduced; copy its details if it recurs. The production
migration, broader Phase 2.5 gates and original Phase 3 remain pending.

References: [Tauri updates](https://v2.tauri.app/plugin/updater/),
[macOS notification wrapper](https://docs.rs/mac-usernotifications/0.3.1/mac_usernotifications/),
[Apple authorization](https://developer.apple.com/documentation/usernotifications/unusernotificationcenter/requestauthorization(options:completionhandler:)).
