# Run the Phase 2.5 checkpoint on Mac

This source ZIP contains Phase 1, Phase 2 and the current Phase 2.5 checkpoint.
Phase 2.5 remains in progress; see [status](phase-2.5.md) and
[real staging checks](phase-2.5-staging-checks.md). It is not an App Store installer.
Keep your existing Base data; do not delete its application-data folder or
Keychain entries. Extract this ZIP into a new directory beside your old checkout.

## Build and open

Use Terminal in the extracted `base-desktop-phase2.5` directory. Xcode Command
Line Tools, Node/npm and Rust are needed to build; the installed app does not
need a Node server. If those tools are already installed from Phase 2, reuse them.

```bash
npm ci
npm test
npm run typecheck
npm run desktop:typecheck
npm run cloud:check
npm run web:typecheck
cargo test --manifest-path native/BaseWorkspace/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
npm run desktop:build
open apps/desktop/src-tauri/target/release/bundle/macos/Base.app
```

Expected tests for this checkpoint: 161 JavaScript, nine standalone workspace
Rust and eleven desktop Rust. macOS build/runtime results must still be recorded on
your Mac; passing Linux tests does not substitute for them.

For development with hot reload, run `npm run desktop:dev`. No `npm run dev` or
local Node backend is needed for normal desktop operation.

## Choose a workspace

Open **Settings → Accounts & Sync**.

- **Local → Run Local Workspace**: Start Workspace, then open/connect to it.
  The Rust service stores its own SQLite data and can continue after Base closes.
  Stop Workspace stops the service without deleting data. Login startup is
  optional. The default loopback health URL is `http://127.0.0.1:53318/health`.
- **Local → Connect to Existing Workspace**: enter its compatible service URL
  and password. Remote services require HTTPS; loopback may use HTTP. Passwords
  and session tokens use Keychain.
- **Cloud → Sign in / create account**: the release connects to the configured
  Base Cloud service; there is no editable Cloud URL. Sign in in your browser,
  explicitly approve the desktop, then return to Base and click Complete sign-in.
  Email and Google are enabled. Apple is currently disabled. Keep this workspace
  separate when prompted; use explicit copy/import only when you intend it.

The production domain `https://base.lucasbrown.xyz` has not been switched to the
new service. The staging backend already runs on Cloudflare; you do not need to
rerun the private key helper or enter server secrets on your Mac. Stripe is a
sandbox: use its test card `4242 4242 4242 4242`, a future expiry and any three-digit
CVC for Plus testing. Never enter a real payment card for these acceptance checks.

## Checks to record

1. Start Local Workspace, create/edit a test record and quit Base entirely.
   `curl --fail http://127.0.0.1:53318/health` must still work. Reopen Base and
   confirm the record persists. Stop/start the service and confirm the same
   identity/data. Test real logout/login if enabling automatic startup.
2. Check the local launch agent with
   `launchctl print "gui/$(id -u)/app.base.workspace"`. Capture service/UI CPU and
   memory separately with Activity Monitor or Instruments.
3. Connect two devices to staging. Test offline edits, quit/reopen while offline,
   reconnect, and concurrent edits with retained conflicts. Check Keychain,
   separate workspace switching and export. Free allows two syncing devices.
4. Test sandbox Plus Checkout and Portal. A cancellation at period end retains
   Plus until the paid period ends. Export and existing records must remain
   accessible after downgrade. Record actual provider vs local fixture results.

Remaining integration/file-upload/migration gates are listed in the status
report. Production data migration and original Phase 3 have not begun.

## Cloud workspaces and branding (Base 0.1.6)

Build with the commands above and quit any old Base copy before launching.
The new app, Dock and website icons use the supplied glass emblem. Keep
Application Support and Keychain data when replacing the app bundle.

1. Open Settings → Accounts & Sync. A Plus account can create an empty named
   workspace; open it and switch back. Existing records and pending edits must
   remain separate. Free accounts cannot create extra owned workspaces.
2. On Plus, create an Editable or Viewable invitation and share the code
   privately. A second signed-in account joins using that code. Check its access,
   change the role, then remove it. Billing and access administration stay with
   the owner. The storage meter is pooled across workspaces the owner owns.
3. Edit a Finance subscription, including a paused one. Change amount, date,
   frequency and notes; verify its paused state and existing identity remain.
4. Disconnect the network, edit an existing Cloud record and quit/reopen Base.
   Restore connectivity and wait for pending changes to drain. Verify on another
   device and test concurrent edits/conflict retention. Cloud still keeps a
   durable local cache while online.
5. Verify the new Dock icon and browser favicon, then test the browser workspace
   selector too. The production domain is not cut over; staging still uses Clerk
   Development and Stripe sandbox. Upgrade through sandbox Checkout for a real
   Plus acceptance test; synthetic fixtures are not a real billing test.

[Full results and limits](cloud-workspaces-016.md). Actual macOS verification of
this build remains pending. No Mac updater archive is published yet.

## Earlier Notes fixes (Base 0.1.5)

Notes checks for this build:

1. Type two paragraphs separated by a blank line, click that blank line and fill
   it. Ordinary text should stay in the same block; Cmd+Enter adds a new block.
2. Drag-select across older blocks. Copy, replace/delete and undo the selection.
   Press Cmd+A once, then Backspace: the body clears while the title stays intact.
3. Click the note icon and upload an image. Restart and verify the image remains
   in the editor, sidebar and breadcrumb. Test offline too.
4. Open the templates popup; test keyboard navigation and reduced motion. Check
   the bottom of the Trash section aligns with the sidebar.

See [Notes changes and actual verification](notes-0.1.5.md). Mac verification is
pending; the new source build must be installed manually because no Mac updater
archive is published yet.

Quit the running Base app before opening the new build. To replace the installed
copy, move the newly built `Base.app` into Applications; replace only the app
bundle, keeping Application Support and Keychain data. The new ICNS uses the supplied glass emblem. A Dock shortcut pointing to an older app can still open that copy.

In onboarding or Settings → News & integrations, choose the market currency,
feed types and publications. Existing YouTube sources should remain visible
and both News and Settings should open even with older partial preferences.
Check that index quotes remain points and commodity units remain labelled.

In Notes, select text and use Add Link or Cmd+K. Search for another note; the
picker shows four at a time. Paste bold/coloured text between notes, then restart
and check formatting persists. Test ordinary typing, Enter and block insertion.
The reported `store-BJSA22lX.js:2:5396` SyntaxError mapped to JSON parsing of an
unsuccessful sync response, rather than typing or paste. Base 0.1.4 reports the
HTTP status instead and retains offline edits for retry. If synchronization fails,
record the new status message and the workspace mode. Other intermittent errors
still need their own traces; this patch has not been verified on Mac hardware.

Run notification checks from the bundled `Base.app`, not an unbundled executable.
Normal bundles now receive ad-hoc signing and request macOS notification
authorization. Verify the test alert and Focus completion with macOS notification
settings enabled. Linux delivery does not establish Mac delivery.

App updates are under Accounts & Sync. This is the first checkpoint with a pinned
signing key/feed, so install it manually once. The Linux AppImage signed update
path has been exercised end-to-end. Mac update archives have not yet been built
or published; Check for updates currently has no newer Mac release to offer.
Keep Mac update verification pending until a signed archive is available.

See [fixes, release setup and acceptance results](phase-2.5-news-notes-updates.md).

## Check the latest interface fixes

Open Settings → News & integrations. Save/remove a TMDB, Cal.com, X or CoinGecko
key and verify the relevant provider with your own account. Cloud keys are
encrypted in the Cloud workspace; local desktop keys use Keychain. AI keys
retain their encrypted News briefing vault. News headlines and market cards
work without a Cloud account. Check index values are labelled in points.

Use Send test notification under Accounts & Sync. If no banner arrives, allow
Base in macOS System Settings → Notifications. Test a short focus session while
Base stays open; native permission reporting cannot establish delivery by itself.

The website is available at the staging URL above: `/` is the landing page and
`/app/` requires Cloud sign-in. Browser workspace caches use IndexedDB, separately
from your desktop SQLite database. Test an actual disconnected browser reload
after signing in and installing the service worker; that physical network check
is pending. Sign-out should show login and retain cached records for next sign-in.

## Check onboarding and shared profiles

Use a separate new test workspace to check first-run setup. Existing onboarded
workspaces intentionally open normally; do not delete their data to force setup.
Check Local start/connect and Cloud approval, then name/photo, light/dark/system,
navigation ordering and optional news/integrations. The saved name/photo should
appear in the sidebar footer and top right. Edit them in Settings → Appearance.

Under Accounts & Sync → Note privacy, set a workspace note password. Sync a
second device and verify the same password unlocks locked notes there and offline.
For legacy locked notes, migrate from a device where the old password works.
Concurrent password changes should require conflict review. This is the existing
privacy gate with a shared verifier; it does not encrypt note contents.

Check the themed Clerk account manager, connected-account status, and the real
landing screenshots. See [implementation and checks](phase-2.5-onboarding.md).
