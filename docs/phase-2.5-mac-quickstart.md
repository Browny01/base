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
cargo test --manifest-path native/BaseWorkspace/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
npm run desktop:build
open apps/desktop/src-tauri/target/release/bundle/macos/Base.app
```

Expected tests for this checkpoint: 139 JavaScript, nine standalone workspace
Rust and ten desktop Rust. macOS build/runtime results must still be recorded on
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
- **Cloud → Connect to a staging cloud**: enter
  `https://base-cloud-staging.kingbrownyplayz.workers.dev`. Sign in in your browser,
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
