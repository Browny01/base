# Bridge for macOS (native SwiftUI shell + auto-update)

Bridge ships to the Mac as a small **native SwiftUI app** that renders the live
web app in a `WKWebView`. Like the iOS build, it points at the production URL, so
**every Vercel deploy of the web app updates the Mac app instantly** — no rebuild.
Unlike iOS (Capacitor), this is a hand-written native shell: a proper Mac window,
titlebar, app icon, and menu-bar commands. **Native-code** changes ship via
**Sparkle** auto-update.

```
Web app (Next.js on Vercel)  ──loads──►  WKWebView  ──shell──►  macOS app
      every deploy auto-updates the app            + native window / menu bar / icon
                                                    + Sparkle auto-update for the shell itself
```

There are two update layers — this is the key mental model:

| You changed…                          | How it reaches the Mac app                  |
| ------------------------------------- | ------------------------------------------- |
| A web feature (page, dashboard, fix)  | **Automatic & instant** — it loads live     |
| The native shell (menu, URL, capability) | Run `npm run mac:release` → Sparkle prompts |

The Mac gets the web app's **desktop** layout (WKWebView sends a desktop user
agent), not the mobile tab-bar UI.

---

## Install it permanently

```bash
brew install xcodegen        # one-time, if not installed
npm run mac:install          # builds Release + installs to /Applications + launches
```

That copies `Bridge.app` into **/Applications**, so it lives in Spotlight,
Launchpad, and the Dock like any other app. Because it's a locally-built app
without a paid Developer ID, the install script clears the Gatekeeper quarantine
flag so it opens without a warning. From then on it keeps itself updated (below) —
you only re-run `mac:install` if you want to reinstall from source.

### Develop in Xcode instead

```bash
npm run mac                  # xcodegen generate + open Bridge.xcodeproj
```

Pick the **Bridge** target and press ▶.

---

## Auto-updates (Sparkle)

The app uses [Sparkle](https://sparkle-project.org), the standard macOS
auto-update framework.

- **On launch and ~daily** it checks the feed in the background. When a newer
  version exists it shows a dialog: **Update / Later / Skip** (it never installs
  silently — `SUAutomaticallyUpdate` is `false`).
- **Manually**: **Bridge menu → Check for Updates…** any time.

### Where updates come from

Your app source stays in the **private** `bridge` repo. The built app + update
feed live in a separate **public** repo, `Browny01/bridge-mac-releases`, as assets
on its rolling **`latest`** GitHub Release — so the app can check anonymously:

```
bridge-mac-releases  (public)  ▸ Release "latest"
  ├── appcast.xml            ← the feed (SUFeedURL points here)
  └── Bridge-<version>.zip   ← the signed app
```

Updates are secured by an **EdDSA** signature independent of Apple code signing.
The private key is in your **login keychain**; the public key is baked into
`macos/Bridge/Info.plist` (`SUPublicEDKey`). Sparkle only installs a zip whose
signature matches — so the private key never leaves your Mac and nobody can push
a rogue update.

### Ship a new native version

Only needed when the **native shell** changes (a new menu item, a new capability,
the web URL). Web-app features need nothing.

```bash
npm run mac:release -- 0.2.0 "What changed in this version"
```

That bumps the version, builds Release, zips + EdDSA-signs the app, regenerates
`appcast.xml`, and uploads both to the `latest` GitHub Release (replacing the old
assets). Installed copies pick it up on their next check (or immediately via
**Check for Updates…**). Commit the version bump it makes in `macos/project.yml`.

> If the Sparkle signing key is ever lost, run Sparkle's `generate_keys` again,
> put the new `SUPublicEDKey` in `Info.plist`, and ship one update signed with the
> old key that carries the new key (or reinstall via `mac:install`).

---

## Layout

```
macos/
  project.yml                 # XcodeGen spec — the source of truth for the project
  Bridge/
    BridgeApp.swift           # @main App, window config, menu bar, Sparkle updater
    WebView.swift             # WebModel (owns the WKWebView) + NSViewRepresentable
    ContentView.swift         # web view + top loading bar over a dark background
    Info.plist                # incl. Sparkle SUFeedURL / SUPublicEDKey
    Assets.xcassets/          # AppIcon (generated from the iOS 1024px icon) + accent
scripts/
  install_mac.sh              # build Release → install to /Applications (npm run mac:install)
  release_mac.sh              # build + sign + publish an update    (npm run mac:release)
```

`Bridge.xcodeproj` and `macos/.build/` are **generated** and git-ignored —
regenerate rather than editing project settings by hand.

## Native touches already wired up

- **Menu bar** — `⌘R` reload, `⌘[` / `⌘]` back/forward (auto-disabled at ends),
  `⌘0` / `⌘+` / `⌘-` zoom, `⌘⇧H` home, **Open in Browser**, and **Check for
  Updates…**.
- **Window** — transparent dark titlebar that blends into the app; min size
  720×480, opens at 1180×800.
- **Session persistence** — default `WKWebsiteDataStore`, so you stay logged in.
- **External links** — clicks to non-Bridge domains (and `target="_blank"`) open in
  your default browser; Bridge links stay in-app.
- **Loading bar** — a thin accent progress bar along the top while pages load.

## If the production domain changes

Update `homeURL` in `macos/Bridge/WebView.swift` (and `capacitor.config.ts` for
iOS), then `npm run mac:release -- <version> "Point at new domain"`.
