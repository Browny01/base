# Phase 2.5 — onboarding, profiles and account polish

Checkpoint verified on Linux and staging on 12 October 2026. This extends the
existing Phase 2.5 work; it does not replace the roadmap or start Phase 3.

## Delivered behavior

- New desktop workspaces open an animated five-step setup: workspace, profile,
  appearance, navigation, and news/integrations. Local setup supports starting
  the existing independent Rust service or connecting to another compatible
  service. Cloud setup retains explicit browser sign-in/device approval and
  separate-workspace confirmation. Existing onboarding markers are honored;
  existing data is not reset. Interrupted setup can resume.
- Browser access requires authenticated Base Cloud access. Login and signup use
  themed Clerk components inside Base. Opening a Cloud workspace after Clerk
  sign-in is explicit, so revoking a device does not silently register it again.
  Previously authenticated, scoped, unexpired cached access supports offline
  use. Anonymous browser records remain retained behind the login gate.
- Name, timezone and an optional photo are stored in the synced workspace
  profile. Images are cropped to a 256-pixel square and compressed as bounded
  JPEG data; original files and metadata are not uploaded. The image/initial
  appears in the sidebar footer and top bar, with editing in Appearance settings.
  Workspace profiles are separate from Clerk's authentication profile.
- Clerk's hosted desktop approval and account manager use Base typography,
  light/dark colors and responsive cards. The account manager renders the
  actual Clerk profile/security controls. The browser account panel shows the
  connected account, plan/storage/devices and account management, without a
  second signup button or the internal staging URL.
- Browser Accounts & Sync hides desktop-only offline-workspace selection and
  account-copy controls. Confirmed backup import remains available, retaining
  an isolated source archive and importing a copy into the current Cloud
  workspace with collision/conflict review. Desktop workspace controls remain.
- Browser sign-out revokes the HttpOnly Base cookie and clears cached access
  before Clerk redirects. Cached records are retained in their original scopes.
- The landing page now uses two actual Linux app screenshots with fictional
  sample workspace data. The old tagline, artificial workspace illustration and
  decorative lines are removed. Optimized WebP files total about 108 KB; PNG
  fallbacks are included. Marketing screenshots are emitted only by the web
  build, avoiding extra desktop assets.

## Shared note unlock password

`profile.notePassword` contains a versioned PBKDF2-SHA256 verifier (210,000
iterations, random 16-byte salt and 32-byte derived hash). Plaintext passwords
are not persisted or synchronized. Desktop Rust and browser WebCrypto validate
the same format, including strict iteration and size bounds. The existing sync
contract treats the entire verifier as one field: concurrent password changes
produce a reviewable conflict rather than mixing one salt with another hash.
Notes re-lock when the verifier changes; offline devices receive changes on sync.

This preserves the existing note privacy gate. It does **not** encrypt note
contents or add end-to-end encryption. Existing device-local verifiers are kept
for compatibility and used only while shared metadata is absent. Migrating
locked notes requires the old password on a device that already unlocks them;
there is no destructive reset or bypass. Malformed shared metadata fails closed.

## Verification

| Check | Result |
| --- | --- |
| JavaScript suite | 153 passed, zero failures/skips |
| Desktop Rust | 11 passed |
| Independent workspace Rust | 9 passed |
| Root, desktop, web, Cloud TypeScript | Passed |
| ESLint | Zero errors, four pre-existing warnings |
| Rust formatting and desktop Clippy (`-D warnings`) | Passed |
| Existing Next.js build | Passed |
| Web Vite build / Worker deployment | Passed |
| Linux Tauri packaging | DEB, RPM, AppImage built |
| Linux native runtime | Setup, local service connection, name/preferences, shared password, restart/persistence verified |
| Independent service | Health endpoint remained available after UI process exit |
| Staging browser runtime | Auth gate, login/signup rendering, profile/photo, setup, account/devices panel, sign-out/cache retention verified |
| Actual Clerk account manager | Profile/security component rendered; component-switch blank-panel bug fixed |
| Staging shared profile/password | Persisted through real Cloud sync; second logical authenticated device received the same profile/verifier and verified the password |
| Landing | Both real images loaded at 1280×850; removed tagline/lines absent |

Linux checks used this development machine, X11 under Xvfb and WebKitGTK. They
do not establish GPU animation performance or actual macOS behavior. The second
Cloud device was an isolated API fixture, not a second physical desktop. The
Clerk check used an owned Development account with one-use provider sign-in
tickets; interactive Google/email verification is still an acceptance gate.
Signup UI rendering was checked without creating a real customer through that
form. Actual disconnected browser reload remains pending; cached access guards
were tested in the automated suite. This checkpoint introduces no new performance
benchmark claims.

The isolated Clerk account, its D1 workspace and four recovery objects in R2
were removed after testing. The temporary acceptance endpoint and its secret
were removed; staging runs the normal repository Worker again. Existing owner
accounts, production data and provider encryption keys were not changed.

## Mac and release checks still required

Use [Mac quickstart](phase-2.5-mac-quickstart.md) to build and run this checkpoint.
Verify Keychain, login startup, UI quit/service independence, photo upload and
note unlock on two actual devices after sync. Keep existing application data.
Already-onboarded workspaces intentionally skip setup; use a separate test
workspace for the first-run wizard rather than deleting an existing workspace.

Clerk remains Development, Stripe remains sandbox and Apple sign-in remains
disabled. Production `base.lucasbrown.xyz` and the Vercel/Upstash deployment
have not been cut over. The broader integration/file migration, recovery,
capacity, packaging and macOS gates in [Phase 2.5 status](phase-2.5.md) remain.
Phase 2.5 is not complete and original Phase 3 has not begun.

Screenshots: [review directory](screenshots/onboarding/).
