# Ready Forecast Tracker Worker

A Cloudflare Worker that measures how accurate Open-Meteo's forecasts turn out to be, for the
coarse locations Ready's pilot users are actually in. This is a **data-collection and
accuracy-monitoring pipeline only** — it never changes `domain/recommendation.js` or any live
behavior. Any proposed adjustment based on what it finds belongs in a manually-reviewed
`model_change_proposals` row (see `supabase/migrations/0007_forecast_accuracy.sql`), not in code
this Worker writes itself.

## What it does

On a Cron Trigger (every 30 minutes):

1. **Snapshot predictions** — for each distinct coarse location (`coarse_latitude`/
   `coarse_longitude`, rounded to 1 decimal degree, ~11km) currently present in
   `push_subscriptions`, fetch Open-Meteo's hourly forecast and record predicted
   temperature/feels-like/precipitation probability & amount/condition/wind/humidity at each
   horizon in `FORECAST_HORIZON_HOURS` (default `6,12,24`) into `forecast_predictions`.
2. **Record actuals** — for existing `forecast_predictions` rows whose `target_time` has passed
   and have no matching `forecast_actuals` row yet, fetch Open-Meteo's *current* conditions for
   that same coarse point (the practical proxy for "actual observed weather" at this project's
   scale — there's no paid historical-weather API in scope) and insert into `forecast_actuals`
   with computed error columns (`temp_error`, `feels_like_error`, `precip_probability_error`,
   `condition_match`, `would_change_recommendation`).

It reuses the same coarse-location data that `push_subscriptions` already collects for
weather-aware notification content (see the root README) — no new location collection.

## Cost notes

Designed for Cloudflare Workers Free and Supabase Free at pilot scale.

- Default cron schedule is every 30 minutes, about 48 invocations/day.
- Each invocation makes a small number of Open-Meteo requests (free, no API key) plus a few
  Supabase REST calls per distinct coarse location — trivial at a 5-10 person pilot's scale.
- Do not enable Workers Paid or paid Supabase unless explicitly approved.

## Required secrets and vars

Set these with `wrangler secret put`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

These non-secret vars are included in `wrangler.toml`:

- `SUPABASE_PUSH_SUBSCRIPTIONS_TABLE=push_subscriptions`
- `SUPABASE_FORECAST_PREDICTIONS_TABLE=forecast_predictions`
- `SUPABASE_FORECAST_ACTUALS_TABLE=forecast_actuals`
- `FORECAST_HORIZON_HOURS=6,12,24`
- `DRY_RUN=true`
- `preview_urls = false` (silences a wrangler warning; this Worker has no user-facing routes)

Keep `DRY_RUN=true` until you've confirmed via logs that it's finding locations and building
predictions correctly. As with `reminder-scheduler`, `DRY_RUN` must be flipped in this committed
`wrangler.toml`, not only in the Cloudflare dashboard — every `wrangler deploy` re-syncs `[vars]`
from this file, so a dashboard-only change silently reverts on the next deploy.

## Local setup

```sh
cd workers/forecast-tracker
npm install
cp .dev.vars.example .dev.vars
```

Fill `.dev.vars` with the same Supabase values used by the backend.

## Local dry run

```sh
npm run dev
```

In another terminal:

```sh
curl "http://localhost:8788/cdn-cgi/handler/scheduled"
```

With `DRY_RUN=true`, it logs what it would snapshot/record without writing anything.

## Deployment

```sh
cd workers/forecast-tracker
npm install
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npm run deploy
```

Leave `DRY_RUN=true` for the first deploy, check the Worker's logs (`npx wrangler tail`) for a
day or two, then set `DRY_RUN=false` in `wrangler.toml` and redeploy once you're satisfied it's
behaving correctly.

## Watching it run

```sh
cd workers/forecast-tracker
npx wrangler tail
```

Each invocation logs a summary: `{ locationsChecked, predictionsSnapshotted, actualsRecorded, dryRun }`.
