# October 2026 security remediation — Base 0.1.7 source

This checkpoint is a source/security update. It does not deploy the legacy
Vercel app, Cloudflare Worker, billing changes or desktop updater artifacts.
`vercel.json` explicitly disables automatic Git deployments on every branch.

## Runtime and dependencies

- Node is pinned to **24.22.1** in `.node-version` and CI. `engine-strict` rejects
  unpatched/unsupported Node lines; the package supports patched 24.x and 26.x.
  [October 21 release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
  fixes the Brotli RCE, TLS/DNS issues and related runtime advisories. Installing
  an npm dependency does not update Node's bundled Undici.
- Next and its ESLint config are **16.4.2**, beyond the **16.4.1** fixes for
  [image optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw),
  [Server Action DoS](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) and
  [cache typed-array RCE](https://github.com/advisories/GHSA-673q-mjm6-r5xr).
- npm Undici copies are constrained to **6.29.1 / 7.30.1**, including the Blob
  and local workerd tooling paths. These fix the applicable October
  [content-encoding DoS](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c),
  EventSource, integrity and cache-redirect advisories. Wrangler is **4.152.0**.
- Native TLS uses **rustls 0.23.46**, **rustls-webpki 0.103.16** and
  **webpki-roots / webpki-root-certs 1.0.10**. These address
  RUSTSEC-2026-0346 through 0349 and the CVE-2026-111943 distrust advisories.
  Existing compiled desktop installations require a rebuilt app to receive them.

The inspected versions before remediation were:

| Component | Found | Remediation / evidence |
| --- | --- | --- |
| Local Node | 25.9.0 (EOL; bundled Undici 7.24.4) | 24.22.1; [official October release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) |
| Next | 16.4.0 locally, 16.2.7 on the old remote main | 16.4.2; the three advisories above |
| npm Undici | 6.29.0 / 7.29.1 | 6.29.1 / 7.30.1; linked upstream advisory |
| braces | 3.0.3 | Local bounded-depth backport; [advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| rustls | 0.23.45 | 0.23.46; [RustSec 0346](https://rustsec.org/advisories/RUSTSEC-2026-0346.html), [0347](https://rustsec.org/advisories/RUSTSEC-2026-0347.html), [0348](https://rustsec.org/advisories/RUSTSEC-2026-0348.html), [0349](https://rustsec.org/advisories/RUSTSEC-2026-0349.html) |
| rustls-webpki | 0.103.15 | 0.103.16; [RustSec 0382](https://rustsec.org/advisories/RUSTSEC-2026-0382.html) |
| webpki-roots / webpki-root-certs | 1.0.9 | 1.0.10; [RustSec 0381](https://rustsec.org/advisories/RUSTSEC-2026-0381.html), [0383](https://rustsec.org/advisories/RUSTSEC-2026-0383.html) |
| GLib Rust | 0.18.5 | Backported mutable-pointer fix; [RustSec 2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) |
| Windows updater ZIP | 4.6.1 | 9.0.5; [RustSec 0367](https://rustsec.org/advisories/RUSTSEC-2026-0367.html), [0368](https://rustsec.org/advisories/RUSTSEC-2026-0368.html), [0369](https://rustsec.org/advisories/RUSTSEC-2026-0369.html) |
| Linux WebKitGTK | 2.52.6-1 | System update to 2.54.1-1; WSA link below |

Version matches are not proof of reachable exploitation: no Server Actions,
Cache Components, Undici cache interceptor or explicit ECH setup were found;
the local Next image path already had the sharp workaround. The Windows ZIP
path is not compiled on Linux/macOS. The runtime update also covers the Node
October Brotli RCE, DNS/TLS validation and HTTP issues; EOL Node 25 does not
receive fixes. Hosted Node and the owner's macOS runtime remain unverified.

## Documented backports

Compatible upstream fixes were unavailable for two existing dependency branches.
Original licenses and source are retained under `vendor/`; no advisory is globally
suppressed and no fake upstream version claims a fix.

- **braces 3.0.3**: the workspace package caps combined brace/parenthesis depth at
  128 and validates externally supplied AST depth/cycles iteratively before
  recursion. Normal expansion and malicious-depth regressions exercise the
  actual ESLint dependency path. This fixes CVE-2026-93687 locally.
- **GLib Rust 0.18.5**: the minimal mutable-out-pointer fix for
  RUSTSEC-2024-0429 is backported. Iterator next/last/nth/reverse behavior is
  covered by a native test, including an optimized build.
- **Tauri updater 2.14.0**: its Windows ZIP dependency uses **zip 9.0.5**, fixing
  RUSTSEC-2026-0367/0368/0369. The existing signed-download flow and archive API
  remain. A native test rejects escaping symlinks and checks privileged mode
  stripping. Windows-native compilation/runtime remains a separate check.

The upstream Rust database still reports seven **maintenance notices** for old
transitive proc-macro-error and zbus_names/zvariant/derive branches. These are
not additional confirmed security vulnerabilities. They require coordinated
parent GTK/D-Bus migrations; this patch does not replace working keyring or
notification integrations merely to hide those notices.

## Credentials, widgets and publication

The exposed widget token is removed from source/history. A fingerprint rejects
it as a legacy password, API token or signing secret in the patched backend,
including password-hash login candidates. Rejection does not reset any account
or data. Previously deployed servers need an explicit rollout/operator rotation;
source publication alone cannot revoke a credential in an old deployment.

The legacy iOS widget now reads a user-configured connection from a shared,
device-bound Keychain group. The native app's toolbar opens Widget connection
settings. Both targets have matching Keychain entitlements. The request sends
the token in a header using an ephemeral session and refuses redirects; tokens
are never embedded in a build, URL query or UserDefaults. An unconfigured
widget makes no request. Signing/Keychain access needs actual iOS verification.

Set a dedicated random **BASE_WIDGET_TOKEN** in the legacy backend and enter it
in the iOS Widget connection form (HTTPS origin, token >=32 characters). This
read-only secret is accepted only by the widget summary route. The old agent
token fallback remains for compatible installations until they migrate, except
for the explicitly revoked exposed value. Widget authentication now rejects
missing/empty credentials and uses constant-time comparison.

Personal screenshots and workstation paths are excluded from publishing history;
development-team signing settings are left for each developer to configure.
Private rollback bundles and original ref mappings stay outside the repository.
Rewriting refs cannot erase existing clones, forks or GitHub's cached objects.
Rotate any exposed credential still accepted elsewhere; contact GitHub Support
if cached sensitive-data removal is required. No private rollback archive is
published. Existing app bundle identifiers, data and compatibility keys remain.

## Verification and operating systems

Local verification on Linux completed:

- Clean `npm ci` and npm audit: zero reported vulnerabilities.
- 185 JavaScript tests; root/desktop/browser/Worker typechecks pass.
- ESLint: zero errors, four pre-existing warnings.
- 13 desktop Rust tests and nine standalone workspace-service tests pass;
  optimized GLib/ZIP regressions, formatting and Clippy also pass.
- Cargo audit: zero security advisories; seven maintenance notices remain
  in the desktop tree, none in the standalone service.
- Next, desktop/browser Vite production builds, Worker dry-run and Tauri Linux
  release build pass. No deployment was performed.

CI additionally builds the iOS app/widget without signing. Its first execution
and macOS/Windows-native checks remain pending; no physical-device or shared
Keychain verification is claimed.

The approved Linux system update installs **WebKitGTK 2.54.1**, above the
[WSA-2026-0006](https://webkitgtk.org/security/WSA-2026-0006.html) fix threshold.
Running processes may retain replaced libraries until restarted. A reboot is
required for the kernel/driver update and must be performed by the owner.
macOS/iPhone system WebKit and installed desktop binaries need their own checks.

Future security checks: `npm audit --audit-level=low`, the security regression
tests, and `cargo audit` against both lockfiles. The local vendor packages need
their documented tests/review because registry scanners do not assess arbitrary
local source. An audit reporting zero vulnerabilities is not a penetration test
or a guarantee about deployment artifacts.
