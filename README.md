# Bridge

Bridge is a personal command center for planning, focus, money, learning, notes,
projects, and AI-assisted daily work. The core product is a Next.js app deployed
to Vercel, with native iOS and macOS shells that load the live web app so product
updates ship immediately after deployment.

## Highlights

- **Overview dashboard** - a full-width command center with greeting, Bridge AI
  prompt, task/habit/project summaries, revenue target progress, portfolio trend
  data, and news briefing cards.
- **Bridge AI chat** - multi-thread chat with folders, pinned and trashed
  conversations, file attachments, optional Bridge data context, reusable skills,
  local Ollama relay support, and web/search tools.
- **Tasks** - priority/tagged tasks, due dates, recurring settings, subtasks, AI
  task breakdowns, completion tracking, and quick-create handoffs from native
  shells.
- **Habits** - button and numeric habits, reminders, daily logs, streak-style
  progress, and history-aware dashboard metrics.
- **Focus** - deep-work timer with session logging, task tags, notes, ambient
  lock mode, and saved focus history.
- **Projects** - active/on-hold/done project tracking with categories, logos,
  milestones, notes, documents, files, links, and detail pages.
- **Notes** - block-based wiki with folders, nested pages, rich blocks, page
  locks, trash/restore, print/export helpers, graph view, and local handoffs.
- **Vision board** - full-bleed canvas for photos, notes, music cards, drawings,
  shapes, arrows, undo/redo, board switching, and image uploads.
- **Finance** - income/spend ledger, daily revenue target, subscriptions, wallet
  balances, token data, FX conversion, and portfolio snapshots.
- **Business** - Stripe stats, Cal.com bookings, business KPIs, social metrics,
  and active project rollups.
- **Personal** - Player OS for skills, domains, goals, body metrics, weight,
  sleep, progress photos, and self-review data.
- **Gym** - workout builder, exercises, sets, notes, repeat/edit/delete flows,
  body metrics, and muscle-map summaries.
- **Learn** - AI-generated courses with modules, lessons, quizzes, source links,
  and sandboxed interactive widgets.
- **News** - RSS/live news, market cards, AI summaries, creator feeds, Reddit/X
  preferences, and live status checks.
- **Settings** - appearance, navigation mode, accent/theme preferences, personal
  AI context, news/feed sources, and local app preferences.
- **Command palette and shortcuts** - `Cmd+K` search across pages, projects,
  notes, chats, boards, and common actions.
- **Native iPhone support** - Capacitor iOS app, branded icons/splash, liquid
  glass mobile tab bar, WidgetKit home-screen widget, push-notification plumbing,
  and a roadmap for Live Activities.
- **Native Mac support** - SwiftUI `WKWebView` shell with native menu commands,
  Spotlight/Dock install flow, external-link handling, and Sparkle update support.
- **Backend integrations** - Upstash Redis/KV persistence, Vercel Blob uploads,
  Gemini, Perplexity, Stripe, Cal.com, wallet/token APIs, cron snapshots, and an
  OAuth-capable MCP server.

## Tech Stack

- **Framework:** Next.js 16 App Router, React 19, TypeScript
- **Styling:** Tailwind CSS v4 with custom monochrome/liquid-glass tokens
- **Storage:** Upstash Redis/KV for app state, Vercel Blob for uploads
- **Native:** Capacitor 8 for iOS, SwiftUI/WebKit for macOS, WidgetKit for widgets
- **AI/search:** Gemini, Perplexity, optional local Ollama relay
- **Deployment:** Vercel with daily cron snapshots

> This repo uses a Next.js version with breaking changes. Before changing
> Next-specific routing, request APIs, proxy behavior, or build configuration,
> read the relevant guide in `node_modules/next/dist/docs/`.

## Project Structure

```text
app/
  (app)/                 Authenticated dashboard routes
  api/                   Route handlers, integrations, MCP, cron, widgets
  login/                 Password login
components/              Page components, navigation, command palette, UI
lib/                     Store, contexts, sessions, AI context, utilities
public/                  Brand assets and PWA manifest
ios/                     Capacitor iOS project and Bridge Widget extension
macos/                   Native SwiftUI macOS shell
scripts/                 Native install/release helpers and maintenance scripts
docs/                    iOS/macOS app notes
```

## Getting Started

Install dependencies:

```bash
npm install
```

Run the web app locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

Build for production:

```bash
npm run build
```

Run static checks:

```bash
npm run lint
npx tsc --noEmit
```

## Environment Variables

Bridge can boot with partial configuration, but the production app expects these
variables depending on the feature set you want enabled:

| Variable | Used for |
| --- | --- |
| `BRIDGE_PASSWORD` | Password login; falls back to the project default if unset |
| `BRIDGE_SESSION_SECRET` | HMAC session cookie signing |
| `BRIDGE_AGENT_TOKEN` | Agent/task API authentication |
| `MCP_TOKEN` | MCP server authentication |
| `CRON_SECRET` | Daily snapshot cron authorization |
| `KV_URL`, `REDIS_URL` | Upstash Redis/KV compatibility URLs |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN` | Redis REST access |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob file uploads |
| `GEMINI_API_KEY` | AI chat, learning, summaries, and task breakdowns |
| `PERPLEXITY_API_KEY` | Web search and live news lookups |
| `STRIPE_SECRET_KEY` | Stripe revenue/business stats |
| `CALCOM_API_KEY` | Cal.com bookings |
| `BRIDGE_CLI_TOKEN` | Optional local Bridge CLI/Ollama relay auth |
| `BRIDGE_ALLOWED_ORIGIN` | Optional local relay origin allowlist |
| `BRIDGE_OLLAMA_URL` | Optional local Ollama endpoint |

Keep env files local. `.env*` and `.vercel/` are intentionally gitignored.

## Native iOS App

The iOS app is a Capacitor shell pointed at the live Vercel deployment:

```ts
server: { url: "https://bridge-ten-lovat.vercel.app" }
```

That means web changes update the installed app as soon as Vercel deploys. Native
changes, such as plugins, widgets, push notifications, Live Activities, app icons,
or signing settings, still require an Xcode build.

Useful commands:

```bash
npm run cap:sync   # sync web config/plugins into ios/
npm run cap:open   # open the Xcode project
npm run ios        # sync and open Xcode
```

The iOS project includes:

- Bridge app icon and splash assets
- Capacitor plugins for app lifecycle, status bar, splash screen, haptics,
  keyboard, and push notifications
- `BridgeWidget` WidgetKit extension for task, streak, habit, and revenue metrics
- Safe-area aware mobile UI and liquid-glass bottom navigation

## Native macOS App

The macOS app is a native SwiftUI/WebKit wrapper around the same live web app. It
adds native window behavior, menu-bar commands, external-link handling, and
Sparkle auto-update support for native shell releases.

Useful commands:

```bash
npm run mac:gen       # generate macOS Xcode project with XcodeGen
npm run mac           # generate and open the project
npm run mac:install   # build Release and install Bridge.app to /Applications
npm run mac:release   # build/sign/publish a Sparkle update
```

See `docs/macos-app.md` for release details.

## Deployment

The production app is deployed on Vercel as a Next.js project. `vercel.json`
declares the framework and schedules the daily snapshot cron:

```json
{
  "framework": "nextjs",
  "crons": [{ "path": "/api/cron/snapshot", "schedule": "0 12 * * *" }]
}
```

Connect the Vercel project to GitHub for automatic deployments on commits. The
iOS and macOS shells will load the latest deployed web app automatically because
both shells point at the production URL.

## Available Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Create a production Next.js build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run cap:sync` | Sync Capacitor iOS project |
| `npm run cap:open` | Open iOS project in Xcode |
| `npm run ios` | Sync and open iOS project |
| `npm run mac:gen` | Generate the macOS Xcode project |
| `npm run mac` | Generate and open the macOS project |
| `npm run mac:install` | Install the macOS app locally |
| `npm run mac:release` | Publish a native macOS Sparkle update |

## Notes for Contributors

- Prefer the existing page/component/store patterns before adding new
  abstractions.
- Do not commit secrets, `.vercel/`, local env files, native build output, or
  generated caches.
- Keep native shells thin: product features should usually live in the web app so
  they deploy once and update everywhere.
- When changing native iOS capabilities, run `npm run cap:sync` and verify the
  Xcode project still builds.
- When changing the macOS shell source, regenerate the project from
  `macos/project.yml` rather than hand-editing generated project files.
