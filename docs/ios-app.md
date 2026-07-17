# Bridge for iPhone (Capacitor)

Bridge ships to the App Store as a **Capacitor** app that loads the live web app.
Because it points at the production URL, **every Vercel deploy of the web app
updates the iOS app instantly** — no rebuild, no resubmit. Native capabilities
(widgets, push, live activities) are added as separate Xcode targets.

```
Web app (Next.js on Vercel)  ──loads──►  Capacitor WKWebView  ──shell──►  iOS app
      every deploy auto-updates the app                 + native targets (widgets / push / live activities)
```

---

## Prerequisites (one time)

- A **Mac** with **Xcode 16+** (from the App Store).
- An **Apple Developer account** ($99/yr) for a real device, TestFlight, and the
  App Store. The simulator works without it.
- **CocoaPods** is not required — Capacitor 8 uses Swift Package Manager.

## First run

From the repo root:

```bash
npm install            # pulls the @capacitor/* deps already in package.json
npm run ios            # cap sync + open Xcode
```

In Xcode: select the **App** target → **Signing & Capabilities** → pick your Team
and set the Bundle Identifier (defaults to `app.bridge.personal` from
`capacitor.config.ts`). Press ▶ to run on a simulator or your iPhone.

That's it — the app opens straight into the live Bridge web app, full-screen,
with the native status bar, splash, and the liquid-glass tab bar.

The native `ios/` project is already committed in this repository. Only run
`npx cap add ios` if you intentionally delete `ios/` and want to regenerate it
from scratch.

## How auto-update works

`capacitor.config.ts` sets `server.url` to the production URL:

```ts
server: { url: "https://bridge-ten-lovat.vercel.app" }
```

The WKWebView loads that URL on launch, so the app always shows the latest
deployed web app. You only rebuild/resubmit the iOS app when you change **native**
code (a new widget, a permission, an SDK) — never for UI or feature changes to the
web app.

> If you point this at a new production domain later, change it here and re-run
> `npm run cap:sync`.

### Offline fallback (optional, later)
`webDir` is `public` as a placeholder. For a graceful offline screen, build a
static fallback into a folder and set `webDir` to it; Capacitor serves it when the
remote server is unreachable.

## What's already handled on the web side

- **Safe areas** — the top bar pads `env(safe-area-inset-top)` and the tab bar
  pads `env(safe-area-inset-bottom)`, so nothing sits under the notch or home
  indicator. `viewport-fit=cover` is set.
- **Status bar** — `apple-mobile-web-app-status-bar-style: black-translucent`, so
  content runs edge-to-edge under a dark status bar.
- **Liquid-glass tab bar** — the mobile bottom nav is a floating frosted bar
  (`components/bottom-nav.tsx`).
- **PWA manifest** — `public/manifest.json`, standalone, dark theme colour.

---

## Roadmap: native capabilities

All of these live in the generated `ios/` Xcode project and share data with the
app through an **App Group** (e.g. `group.app.bridge.personal`). Add the App Group
capability to the App target first (Signing & Capabilities → + Capability → App
Groups).

### 1. Push notifications
- `@capacitor/push-notifications` is already installed.
- In Xcode add the **Push Notifications** capability; create an **APNs key** in the
  Apple Developer portal.
- Register for a token in the web app via the plugin and store it against the user
  (a small `/api/push/register` endpoint), then send via APNs from the Bridge
  backend or a cron.

### 2. Home-screen widgets (WidgetKit) — ✅ DONE
The **BridgeWidget** target already exists (`ios/App/BridgeWidget/`), built by
`scripts/add_widget_target.rb`. It's a native SwiftUI widget that fetches the
read-only **`/api/widget/summary`** endpoint (token-guarded; the device passes its
local date so "today" matches the app) and shows:

- **Small**: Tasks Left (big) + done-today, with streak + revenue at the bottom.
- **Medium**: Tasks · Streak · Habits · Revenue-vs-target (with a progress bar).

To put it on your phone/simulator: **long-press the home screen → tap `+` → search
"Bridge" → pick a size → Add Widget.** It refreshes ~every 30 min.

The token is currently hard-coded to the server default (`151715`). If you set a
custom `BRIDGE_PASSWORD` / `BRIDGE_AGENT_TOKEN`, update `BridgeAPI.token` in
`BridgeWidget.swift` (or later: have the app write the token to a shared App Group
that the widget reads).

To regenerate the target from scratch (e.g. after `npx cap add ios`):
`ruby scripts/add_widget_target.rb`.

### 3. Live Activities (ActivityKit)
- Add an **ActivityKit** widget to the Widget Extension; enable
  **Supports Live Activities** in the App target's Info.
- Natural fit: the **Focus / Lock In timer** — start an Activity when a session
  begins (via a tiny Capacitor plugin bridging JS → Swift), update it as the timer
  ticks, end it on completion. Shows on the Lock Screen and Dynamic Island.

### 4. Nice-to-haves
- `@capacitor/haptics` (installed) — fire a light tap on key actions.
- `@capacitor/keyboard` (installed) — resize behaviour for the chat/composer.

---

## App Store review note

Apps that load remote web content are allowed, but must provide native value and
not be "just a website." Bridge clears this by adding native widgets, push, and
live activities. Keep at least one native capability shipping before submitting.

## Handy scripts

```bash
npm run cap:sync   # copy config + plugins into the iOS project
npm run cap:open   # open the iOS project in Xcode
npm run ios        # sync + open
```
