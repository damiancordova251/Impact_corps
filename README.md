# Ready

Ready is a mobile-first PWA that turns the weather forecast for however long you'll be away from
home into a simple clothing checklist. It supports English and Spanish, sends a weather-aware
push reminder at whatever time you choose, and lets you share it with friends via a referral
link.

## How it works

1. You grant location once; Ready fetches the forecast for the window you expect to be away
   (3/6/9/12 hours) from Open-Meteo and turns it into a grouped clothing checklist (footwear,
   pants, shirts, outerwear, accessories).
2. Optionally, you save clothing preferences (what you actually own/wear) so the checklist
   recommends from your own wardrobe instead of generic defaults. This stays on-device only.
3. Optionally, you enable a daily push reminder at a routine time you set. The reminder can
   mention rain/cold/heat if you've allowed a coarse (rounded, ~11km) location for that purpose.
4. You can share Ready with friends via a referral link, and report a problem any time from
   Settings.

Exact location and clothing preferences never leave the device. See "Privacy" below for exactly
what does.

## Architecture

- **Frontend**: vanilla JS ES modules, no bundler, no framework. Entry point `src/app.js`; feature
  modules live under `src/features/`, with `src/{constants,state,dom,utils,services,domain,i18n}/`
  as shared layers. `sw.js` is the service worker (must stay at the project root — service worker
  scope is tied to where the file is served from).
- **Hosting**: Cloudflare Pages serves the static frontend (`dist/`, built by
  `scripts/build-pages.js`) and same-origin `/api/*` routes via Cloudflare Pages Functions
  (`functions/`). This is the primary, production origin, and it **auto-deploys from every push to
  `main`**.
- **Fallback**: an Express server (`server/`) can serve the same app and API for local development
  (`npm run dev`) and as a secondary deployment target (e.g. Render). It duplicates the Functions'
  backend logic using Node-native packages (`@supabase/supabase-js`, `web-push`) where Cloudflare's
  Workers runtime requires different, Workers-safe equivalents (raw REST calls, `@block65/webcrypto-web-push`).
  This dual-runtime duplication (`server/*.js` next to `functions/_shared/backend.js`, and
  `workers/reminder-scheduler/src/notificationCopy.js` next to `server/notificationCopy.js`) is an
  intentional, established project convention — keep both sides in sync when changing either.
- **Scheduled jobs**: two independent Cloudflare Workers, each with their own `wrangler.toml`,
  deployed manually via `wrangler deploy` (not part of the Pages auto-deploy):
  - `workers/reminder-scheduler/` — sends the daily push reminder on a 5-minute Cron Trigger. This
    is the live, production reminder sender (Render's own interval scheduler is disabled via
    `ENABLE_EXPRESS_SCHEDULER=false`).
  - `workers/forecast-tracker/` — a forecast-accuracy data-collection pipeline on a 30-minute Cron
    Trigger. Never touches recommendation logic; see its own README.
- **Storage**: Supabase Postgres, accessed only from the backend (Express or Functions/Workers)
  using the service-role key — the browser never talks to Supabase directly. Every table has RLS
  enabled with no `anon`/`authenticated` policies. See `supabase/README.md` for the full schema and
  `supabase/ANALYTICS_QUERIES.md` for example queries.

## Project structure

```
src/                    Frontend (ES modules, no build step)
  app.js                Bootstrap: imports and initializes every feature module
  constants/            Shared localStorage key names
  state/                In-memory app state
  dom/                  Cached DOM element references
  utils/                Small stateless helpers (formatting, browser checks, error reporting)
  services/              API clients and analytics (weather, location, notifications, referrals)
  domain/               Pure recommendation/checklist logic, no DOM or network access
  i18n/                  Hand-built i18n (en/es), no dependency (see "Why no i18n library" below)
  features/              One folder per UI feature, each owning its own DOM wiring
  changelog.js           Shown under the update-available banner's Refresh button

server/                 Express server: local dev + optional secondary deployment
functions/              Cloudflare Pages Functions: production /api/* routes
  _shared/backend.js     Shared Supabase REST + validation helpers for the Functions runtime
workers/
  reminder-scheduler/    Cron Worker: sends the scheduled push reminder
  forecast-tracker/      Cron Worker: forecast-accuracy data collection
supabase/               SQL migrations + schema docs + example analytics queries
tests/                  Plain node --check-able test scripts (no test framework)
scripts/                One-off local scripts (build:pages, generate:icons)
```

## Local development

```sh
npm install
cp .env.example .env
npm run generate:vapid   # paste the output into .env
npm run dev
```

Open `http://localhost:3000`. The Express server serves both the PWA and the `/api/*` endpoints
from one origin, matching how the service worker and push subscriptions expect same-origin API
calls.

### Environment variables (`.env`)

```
PORT=3000
HOST=127.0.0.1
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
ENABLE_EXPRESS_SCHEDULER=true
SCHEDULER_INTERVAL_MS=30000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PUSH_SUBSCRIPTIONS_TABLE=push_subscriptions
SUPABASE_PILOT_EVENTS_TABLE=pilot_events
```

Every other table name (`analytics_events`, `feedback_submissions`, `referrals`, etc.) has a
working default and only needs an env var if you renamed a table — see `supabase/README.md`.
Never commit `.env` or any `.dev.vars` file; the service-role key and VAPID private key must never
reach frontend code.

## Testing

```sh
npm run check              # node --check across every server/frontend/Worker file
npm run test:recommendations  # recommendation engine, personalized checklist, notification copy, forecast-tracker logic
npm run build:pages        # builds the Cloudflare Pages static export into dist/
```

There's no test framework — `tests/*.test.js` are plain scripts using `node:assert/strict`, run
directly with `node`. Prefer real, live verification for anything touching Supabase or push
delivery over mocking: create a test row, verify it round-trips, then delete it.

## Deployment

**Cloudflare Pages** (frontend + `/api/*`) auto-deploys from every push to `main` — nothing manual
required. Its build command is `npm run build:pages`, output directory `dist`, functions directory
`functions`. Required Pages variables/secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

**The two Cloudflare Workers deploy independently and manually** — a push to `main` does *not*
redeploy them:

```sh
cd workers/reminder-scheduler && npm run deploy
cd workers/forecast-tracker && npm run deploy
```

See each Worker's own README for its required secrets and safe rollout order. Both Workers commit
their `DRY_RUN` setting directly in `wrangler.toml` rather than only in the Cloudflare dashboard —
`wrangler deploy` re-syncs `[vars]` from that file on every deploy, so a dashboard-only override
silently reverts on the next redeploy (this exact mistake once silently disabled all scheduled
reminders for about a month).

**Render** (optional secondary deployment of the Express server) is not required for production
today, since Cloudflare Pages + Workers cover the same job, but the Express fallback is kept
working for local development and as a backup path.

## Privacy

- Exact location is never sent anywhere — it's used on-device to fetch weather, and the last
  usable location is cached in `localStorage` only.
- Clothing preferences stay in `localStorage` only, never sent to the backend or analytics.
- A *coarse* location (rounded to 1 decimal degree, ~11km) is sent only if you enable reminders,
  used only to pick weather-aware notification wording and for the forecast-accuracy pipeline's
  regional accuracy monitoring — never for per-region recommendation tuning.
- An anonymous, client-generated installation id (no accounts, no PII) is used for basic usage
  analytics and the referral system.

## Why no i18n/bundler library

Translations are hand-written plain `.js` modules (`src/i18n/translations/en.js`/`es.js`), not
`.json` imports — Safari's support for JSON import attributes is inconsistent across this
project's target iOS versions. There's no bundler anywhere in the frontend: every file is served
as-is via native ES modules, which keeps the deploy pipeline (and any future contributor's mental
model) simple at this project's scale.

## Further reading

- `supabase/README.md` — full schema, what's collected and why, how to apply migrations
- `supabase/ANALYTICS_QUERIES.md` — example queries (DAU/WAU/MAU, retention, referral conversion, notification performance, forecast accuracy)
- `workers/reminder-scheduler/README.md` — the scheduled-reminder Worker
- `workers/forecast-tracker/README.md` — the forecast-accuracy Worker
