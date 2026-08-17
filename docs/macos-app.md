# Base for macOS

Base for macOS is a native SwiftUI/WebKit host for the production Base site.
The normal online experience is the complete website, with the same interface,
routes, and behavior as a browser. If the site cannot load, the app switches to
the shared native workspace so core records remain available offline.

## Install

```bash
brew install xcodegen   # one time
npm run mac:install
```

The install script generates the Xcode project, builds a Release app, installs it
at `/Applications/Base.app`, and launches it. Base then appears in Spotlight,
Launchpad, and the Dock.

For development:

```bash
npm run mac
```

Select the `Base` scheme and press Run.

## Global shortcut

Press `Control+Option+Space` from any application to activate Base and bring its
window to the front. The shortcut is registered with Carbon, so it does not need
Accessibility permission. A tap of Fn/Globe is also supported as a convenience,
but macOS may reserve that key for system features on some keyboards.

If the shortcut is already owned by another app, change or disable the conflicting
shortcut in **System Settings > Keyboard > Keyboard Shortcuts**.

## Website and offline behavior

`macos/Bridge/WebView.swift` loads the production URL in a persistent `WKWebView`,
including the normal website navigation, settings, uploads, AI tools, and browser
session. External links open in the default browser, while Base links stay in
the app.

If initial navigation fails, `ContentView` displays native screens for Today,
Tasks, Projects, Notes, Habits, Focus, Finance, and cached News. Edits are saved
locally and queued by `native/BridgeCore/BridgeStore.swift`. Network.framework
retries the website and synchronizes native changes after connectivity returns.

Cloud-generated features still require internet. News displays the last cached
briefing while offline.

## Project layout

```text
native/BridgeCore/
  BridgeData.swift       JSON-preserving record model
  BridgeStore.swift      local snapshot, queue, reachability, sync
  BridgeViews.swift      shared iPhone/Mac SwiftUI screens
macos/
  project.yml            XcodeGen source of truth
  Bridge/
    BridgeApp.swift      app lifecycle, global shortcut, Sparkle
    ContentView.swift    website host and native fallback switch
    WebView.swift        persistent Base web view and navigation
    Info.plist           app and Sparkle configuration
    Assets.xcassets/     icon and accent assets
```

Regenerate `macos/Base.xcodeproj` after changing `project.yml`:

```bash
npm run mac:gen
```

## Sparkle updates

Installed builds check the Sparkle feed on launch and approximately once per day.
Use **Base > Check for Updates...** to check manually. Updates are signed with
the Sparkle EdDSA key and published to the public
`Browny01/bridge-mac-releases` release repository.

Publish a native release with:

```bash
npm run mac:release -- 0.2.1 "Full Base website with offline fallback"
```

The release script bumps the version, builds and signs the app archive, regenerates
`appcast.xml`, and uploads both assets. Commit the resulting version change in
`macos/project.yml`.

Web changes appear in the Mac app after their Vercel deployment. Changes to the
Mac host or shared offline fallback require a Sparkle release; iPhone native
changes require a new Xcode build.
