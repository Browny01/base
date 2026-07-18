# Bridge for macOS

Bridge for macOS is a native SwiftUI app built from the same offline-first core as
the iPhone app. It launches from local data, supports record editing without a
connection, and syncs queued changes when connectivity returns.

## Install

```bash
brew install xcodegen   # one time
npm run mac:install
```

The install script generates the Xcode project, builds a Release app, installs it
at `/Applications/Bridge.app`, and launches it. Bridge then appears in Spotlight,
Launchpad, and the Dock.

For development:

```bash
npm run mac
```

Select the `Bridge` scheme and press Run.

## Global shortcut

Press `Control+Option+Space` from any application to activate Bridge and bring its
window to the front. The shortcut is registered with Carbon, so it does not need
Accessibility permission. A tap of Fn/Globe is also supported as a convenience,
but macOS may reserve that key for system features on some keyboards.

If the shortcut is already owned by another app, change or disable the conflicting
shortcut in **System Settings > Keyboard > Keyboard Shortcuts**.

## Offline behavior

The Mac app includes native screens for Today, Tasks, Projects, Notes, Habits,
Focus, Finance, and cached News. Edits are saved locally before network work begins.
`native/BridgeCore/BridgeStore.swift` queues record-level operations, watches
connectivity with Network.framework, and sends them to `/api/native/sync` after
reconnection. The server merges each record atomically so unrelated changes from
the web or iPhone app are preserved.

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
    ContentView.swift    shared native root view
    Info.plist           app and Sparkle configuration
    Assets.xcassets/     icon and accent assets
```

Regenerate `macos/Bridge.xcodeproj` after changing `project.yml`:

```bash
npm run mac:gen
```

## Sparkle updates

Installed builds check the Sparkle feed on launch and approximately once per day.
Use **Bridge > Check for Updates...** to check manually. Updates are signed with
the Sparkle EdDSA key and published to the public
`Browny01/bridge-mac-releases` release repository.

Publish a native release with:

```bash
npm run mac:release -- 0.2.0 "Offline-first native Bridge"
```

The release script bumps the version, builds and signs the app archive, regenerates
`appcast.xml`, and uploads both assets. Commit the resulting version change in
`macos/project.yml`.

Web/API changes deploy through Vercel. Shared native SwiftUI changes require a
Sparkle release for installed Mac copies and a new Xcode build for iPhone.
