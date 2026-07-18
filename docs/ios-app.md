# Bridge for iPhone

Bridge for iPhone is a native SwiftUI app. It does not load the website in a web
view. The app launches from an on-device snapshot and keeps a durable queue of
changes made while offline.

## Requirements

- macOS with Xcode 16 or newer
- An Apple ID selected as the signing team for a personal device build
- A paid Apple Developer membership only for TestFlight or App Store distribution

## Install on a real iPhone

From the repository root:

```bash
npm install
npm run ios
```

In Xcode:

1. Select the `App` project and the `App` target.
2. Open **Signing & Capabilities** and choose your Team.
3. Keep `app.bridge.personal` as the bundle identifier, or choose a unique one if
   Xcode reports that it is unavailable for your team.
4. Connect and unlock the iPhone, trust the Mac when prompted, and select the
   phone from the run destination menu.
5. Press Run. On first use, iOS may ask you to enable Developer Mode and trust the
   developer certificate in **Settings > General > VPN & Device Management**.

The `BridgeWidgetExtension` target is embedded automatically. Its bundle
identifier must remain prefixed by the app bundle identifier when changing IDs.

## Native features

- Today dashboard with task, project, habit, and pending-sync metrics
- Offline task creation, completion, and deletion
- Offline project creation and status updates
- Native notes with safe paragraph appends that preserve existing rich blocks
- Daily habits and completion logs
- Focus timer and session history
- Income/spend ledger
- Cached news briefing with online refresh
- WidgetKit home-screen widget

AI chat, live news generation, market APIs, and other cloud integrations still
require a connection. Previously downloaded data and the last news briefing remain
available offline.

## Offline sync

`native/BridgeCore/BridgeStore.swift` writes the complete Bridge JSON snapshot and
pending operations to the app's Application Support directory. Every native edit:

1. Updates the local snapshot immediately.
2. Adds an `upsert` or `delete` operation for one record.
3. Attempts sync if the Network framework reports connectivity.
4. Keeps the operation on disk if the request fails or the device is offline.

On reconnect, `POST /api/native/sync` applies the operation batch atomically in
Redis, preserves unrelated web-only fields, and returns the merged document. The
same algorithm is used by the Mac app.

The sync API must be deployed before a fresh install can download existing data.
Until then, local edits remain queued and will upload after the API is available.

## Build verification

```bash
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -sdk iphonesimulator \
  -configuration Debug \
  -derivedDataPath ios/App/DerivedData/native-check \
  CODE_SIGNING_ALLOWED=NO build
```

Native app changes require a new Xcode/TestFlight/App Store build. Web-only
changes continue to deploy independently to Vercel.

## Home-screen widget

Long-press the Home Screen, tap `+`, search for Bridge, and choose a widget size.
The widget uses `/api/widget/summary` and refreshes separately from the app's
offline store. If the production authentication token changes, update
`BridgeAPI.token` in `ios/App/BridgeWidget/BridgeWidget.swift`.
