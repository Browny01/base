# Base

Base is a personal command center for planning, focus, money, notes, projects,
and AI-assisted daily work. It includes a Next.js web app plus native
SwiftUI apps for iPhone and Mac. The native apps keep a local copy of Base data,
queue edits without a connection, and merge those edits when the internet returns.

## Highlights

- **Overview dashboard** - a full-width command center with greeting,
  task/project summaries, revenue target progress, portfolio trend data, and
  news briefing cards.
- **Tasks** - priority/tagged tasks, due dates, recurring settings, subtasks, AI
  task breakdowns, completion tracking, and native offline creation.
- **Calendar** - editable all-day and timed events, recurring series, month and
  agenda views, plus dated tasks, milestones, payments, exams, workouts, and
  optional Cal.com bookings in one schedule.
- **Focus** - deep-work timer with session logging, task tags, notes, and saved
  focus history.
- **Projects** - active/on-hold/done project tracking with categories, logos,
  milestones, notes, documents, files, links, and detail pages.
- **Notes** - block-based wiki with folders, nested pages, rich blocks, page
  locks, trash/restore, print/export helpers, graph view, and native offline notes.
- **Vision board** - full-bleed canvas for photos, notes, music cards, drawings,
  shapes, arrows, undo/redo, board switching, and image uploads.
- **Finance** - income/spend ledger, daily revenue target, subscriptions, wallet
  balances, token data, FX conversion, and portfolio snapshots.
- **News** - RSS/live news, market cards, AI summaries, creator feeds, Reddit/X
  preferences, and live status checks.
- **Settings** - appearance, navigation mode, accent/theme preferences, personal
  AI context, news/feed sources, and local app preferences.
- **Command palette and shortcuts** - `Cmd+K` search across pages, projects,
  notes, boards, and common actions.
- **Native iPhone support** - SwiftUI dashboard, tasks, projects, notes, habits,
  focus, finance, cached news, offline mutation queue, and WidgetKit home-screen
  widget.
- **Mac support** - the complete live Base interface in a native window, a
  SwiftUI offline fallback, a reliable `Control+Option+Space` global shortcut,
  Spotlight/Dock install flow, and Sparkle updates.
- **Backend integrations** - Upstash Redis/KV persistence, Vercel Blob uploads,
  Gemini, Perplexity, Cal.com, wallet/token APIs, cron snapshots, and an
  OAuth-capable MCP server.

## Tech Stack

- **Framework:** Next.js 16 App Router, React 19, TypeScript
- **Styling:** Tailwind CSS v4 with custom monochrome/liquid-glass tokens
- **Storage:** Upstash Redis/KV for app state, Vercel Blob for uploads
- **Native:** SwiftUI and WidgetKit for iPhone, SwiftUI/WebKit hybrid for Mac,
  Network framework reconnect detection, Sparkle for Mac updates
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
native/BridgeCore/       Shared native models, offline store, sync queue, and views
ios/                     Native SwiftUI iOS project and Bridge Widget extension
macos/                   macOS WebKit host, offline fallback, and Sparkle config
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

Base can boot with partial configuration, but the production app expects these
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

The iPhone app is a real SwiftUI client, not a web view. It opens from local data,
so tasks, projects, notes, habits, focus sessions, and finance entries remain usable
without internet. Each change is written to disk immediately and added to a durable
operation queue. On reconnect, `/api/native/sync` atomically merges those record
changes into the main Base document and downloads the latest state.

```bash
npm run ios   # open ios/App/App.xcodeproj
```

Choose the `App` scheme and your signing team in Xcode, then run on a simulator or
connected iPhone. The project also includes the `BridgeWidget` WidgetKit extension.
See `docs/ios-app.md` for signing, offline behavior, and installation details.

## macOS App

The macOS app renders the production Base website directly, so it has the same
layout, routes, and functionality as Base in a browser. If the website cannot
be reached, it switches to the shared native workspace; offline edits are queued
and synchronized after reconnecting. Press `Control+Option+Space` from any app to
bring Base forward. Sparkle distributes Mac app updates.

Useful commands:

```bash
npm run mac:gen       # generate macOS Xcode project with XcodeGen
npm run mac           # generate and open the project
npm run mac:install   # build Release and install Base.app to /Applications
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

Connect the Vercel project to GitHub for automatic web/API deployments. Native app
code ships separately through Xcode/TestFlight on iOS and Sparkle on macOS. The
native clients use the deployed API for synchronization and news refreshes.

## Available Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Create a production Next.js build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run ios` | Open the native iOS project |
| `npm run mac:gen` | Generate the macOS Xcode project |
| `npm run mac` | Generate and open the macOS project |
| `npm run mac:install` | Install the macOS app locally |
| `npm run mac:release` | Publish a native macOS Sparkle update |

## Notes for Contributors

- Prefer the existing page/component/store patterns before adding new
  abstractions.
- Do not commit secrets, `.vercel/`, local env files, native build output, or
  generated caches.
- Put shared iOS/macOS data behavior and screens in `native/BridgeCore`; keep only
  platform lifecycle and shortcut code in the platform folders.
- Preserve unknown JSON fields when extending native sync so older clients cannot
  erase newer web-only data.
- Verify both native targets after shared Swift changes.
- When changing the macOS shell source, regenerate the project from
  `macos/project.yml` rather than hand-editing generated project files.
