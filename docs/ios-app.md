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

`native/BridgeCore/BridgeStore.swift` writes the Bridge snapshot, operation
outbox, sync cursor, record revisions, and unresolved conflicts to a WAL-backed
SQLite database in Application Support. A legacy `offline-data.json` snapshot is
imported automatically on first launch. Every native edit:

1. Updates the local snapshot immediately.
2. Adds an idempotent `upsert`, field-level `patch`, or `delete` operation for one record.
3. Attempts sync if the Network framework reports connectivity.
4. Keeps the operation on disk if the request fails or the device is offline.

On reconnect, `POST /api/native/sync` applies the operation batch atomically in
Redis, checks its base revision, writes deletion tombstones, records a change
cursor, and acknowledges operation IDs. Different-field edits merge
automatically; concurrent note/chat edits and delete-versus-edit races are held
for review instead of silently replacing either copy. The same algorithm is
used by the web and Mac apps.

Generate a native pairing token under **Bridge > Settings > Offline & sync**,
then paste it into **More > Offline & Sync** on iPhone. The one-year credential
is stored in Keychain and the native app never receives Redis credentials.

Sync is attempted after an edit, at launch, on foreground, when connectivity
returns, and through an iOS background app-refresh request. iOS chooses the
actual background execution time; opening the app always performs the fallback
refresh.

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
