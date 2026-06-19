# Ready

Ready is a PWA that creates a Ready Checklist from the weather window you expect to be away from home.

## Pre-Pilot Polish

This stage prepares the PWA and Express backend for personal iPhone testing and a small pre-pilot.

- Push subscriptions survive server restarts.
- Supabase is used from the backend only.
- The Supabase service role key must never be exposed to frontend JavaScript.
- Exact location is not stored in Supabase.
- There are no accounts or user records yet.
- Local development can use the Express interval scheduler, but pilot scheduled reminders should run from Cloudflare Worker Cron to avoid Render Free sleep.
- The notification is intentionally simple: it opens the app, where the Ready Checklist is generated.

## Install

```sh
npm install
```

## Generate VAPID Keys

```sh
npm run generate:vapid
```

Copy `.env.example` to `.env`, then paste the generated values:

```sh
PORT=3000
HOST=127.0.0.1
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:you@example.com
ENABLE_EXPRESS_SCHEDULER=true
SCHEDULER_INTERVAL_MS=30000
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_backend_only_service_role_key
SUPABASE_PUSH_SUBSCRIPTIONS_TABLE=push_subscriptions
SUPABASE_PILOT_EVENTS_TABLE=pilot_events
```

Do not commit `.env`.

## Supabase Free Setup

Use Supabase Free only for this stage. Do not enable Pro, paid add-ons, billing upgrades, Point-in-Time Recovery, custom domains, or any usage-based paid feature.

Supabase Free is enough for a 5-10 person pilot because this app stores only a few tiny reminder rows. Free projects can be paused after inactivity and have plan limits, so check the Supabase dashboard before pilot testing.

1. Create or open a Supabase Free project.
2. In Supabase, open the SQL Editor.
3. Run this SQL:

```sql
create table if not exists public.push_subscriptions (
  id text primary key,
  subscription jsonb not null,
  routine_start_minutes integer not null check (
    routine_start_minutes >= 0
    and routine_start_minutes < 1440
    and routine_start_minutes % 30 = 0
  ),
  timezone text not null check (char_length(timezone) > 0),
  last_sent_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create table if not exists public.pilot_events (
  id uuid primary key default gen_random_uuid(),
  anonymous_device_id text not null,
  event_type text not null check (
    event_type in (
      'app_opened',
      'checklist_generated',
      'checklist_completed',
      'reminders_enabled',
      'notification_clicked',
      'weather_screen_viewed',
      'location_updated'
    )
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.pilot_events enable row level security;
```

No public Row Level Security policies are needed for these tables. The browser does not talk to Supabase directly; only the Express backend uses the service role key.

4. In Supabase Project Settings, copy the project URL into `SUPABASE_URL`.
5. Copy the `service_role` key into `SUPABASE_SERVICE_ROLE_KEY`.
6. Keep the service role key in `.env` only. Never place it in `src/`, `index.html`, `sw.js`, or any frontend config.

The persisted reminder fields are:

- `id`
- push subscription JSON
- routine start time in minutes
- timezone
- last reminder sent date
- created/updated timestamps

Ready intentionally does not persist latitude, longitude, or accuracy to Supabase.

The pilot event fields are:

- `id`
- anonymous device id
- event type
- small metadata JSON
- created timestamp

Pilot events are anonymous and intentionally minimal. They do not store exact location, names, emails, or user-entered personal information.

## Deployment Recommendation

Use a Render Free Web Service for Stage 7C personal testing.

Why Render:

- It can run the existing Express server and PWA from one HTTPS origin.
- It supports Node apps with `npm install` and `npm start`.
- It provides a free `onrender.com` HTTPS URL.
- It is beginner-friendly for Git-based deploys.

Free-hosting warnings:

- Render Free web services spin down after 15 minutes without inbound traffic and take about one minute to wake back up.
- The scheduler does not run while the service is asleep, so scheduled reminders can be missed.
- Render can restart Free services, and the local filesystem is ephemeral. Supabase keeps reminder data safe, but the running scheduler is still not durable.
- Free usage limits apply. If limits are exceeded and no payment method is attached, Render may suspend services instead of billing.
- Render Free is enough for personal iPhone Web Push testing. It is not reliable enough for pilot reminder delivery.

For reliable pilot reminders, use an always-on service or a separate durable scheduler/worker that can run at reminder time.

Other options considered:

- Railway: easy deploy flow, but the free path is credit/trial based and can have network restrictions if the account is not verified.
- Fly.io: powerful, but it is not a true free tier and requires close billing management.
- Koyeb: has a free web instance, but requires card verification and the free instance scales to zero after inactivity.

## Cloudflare Pages CF-2 Static PWA Export

CF-2 prepares a clean static PWA deployment for Cloudflare Pages Free. It does not move API routes yet, does not remove Render, and does not change push subscription behavior.

Cost warning:

- This stage is designed for Cloudflare Pages Free, Cloudflare Workers Free, Supabase Free, and Render Free.
- Do not enable paid Pages features, Workers Paid, paid Cloudflare storage, paid custom domains, paid Render, paid Supabase, or billing upgrades unless explicitly approved.
- Cloudflare Pages Free has platform limits such as monthly build/deploy limits, but this small static PWA should fit normal pilot testing.

The Pages export uses an explicit frontend allowlist. It copies only:

- `index.html`
- `styles.css`
- `src/`
- `icons/`
- `manifest.webmanifest`
- `sw.js`

It does not copy:

- `server/`
- `workers/`
- `.env`
- `.dev.vars`
- Supabase service keys
- VAPID private keys
- README files
- `node_modules/`
- package lock files
- backend-only files

Build locally:

```sh
npm run build:pages
```

Cloudflare Pages setup:

```text
Build command: npm run build:pages
Output directory: dist
```

No frontend bundling is required. `sw.js` and `manifest.webmanifest` are copied to the root of `dist/`, so service worker scope and manifest paths are preserved. Existing relative paths such as `src/app.js`, `styles.css`, and `icons/app-icon.svg` remain compatible.

CF-2 API limitation:

- The Cloudflare Pages version is for static PWA shell testing only.
- Render remains the working PWA/API host during CF-2.
- The Pages app will not have `/api/*` routes until CF-3.
- Checklist generation and weather can still be tested because weather uses the public Open-Meteo API directly.
- Server-backed flows such as push subscription saving, backend test push, scheduled reminder API behavior, and pilot analytics should be considered incomplete on the Pages URL until CF-3.
- After CF-3, Pages Functions provide same-origin `/api/*` routes for the Pages URL.

Origin and PWA notes:

- A Pages URL such as `https://ready.pages.dev` is a different origin from `https://ready-ussg.onrender.com`.
- iPhone users should install the Pages URL as a new Home Screen PWA when testing CF-2.
- Service worker scope changes to the Pages origin.
- Push subscriptions from the Render origin do not carry over automatically.
- Old Render-origin Supabase subscriptions should not be cleaned up until a later API/push migration stage.

CF-2 local verification:

```sh
npm run build:pages
find dist -maxdepth 2 -type f | sort
```

Confirm `dist/` contains the PWA assets and does not contain `server`, `workers`, `.env`, `.dev.vars`, `node_modules`, or backend-only files.

## Cloudflare Pages CF-3 API Functions

CF-3 moves the Express API behavior to Cloudflare Pages Functions while keeping Render online as a fallback. The static PWA stays in `dist/`, and Cloudflare serves `/api/*` from the repo's `functions/` directory on the same Pages origin.

Cost warning:

- This stage is designed for Cloudflare Pages Free, Cloudflare Workers Free, Supabase Free, and Render Free for a 5-10 person pilot.
- Do not enable Workers Paid, paid Cloudflare storage, paid custom domains, paid Render, paid Supabase, or billing upgrades unless explicitly approved.
- Cloudflare Free limits still apply to Pages builds, Pages Functions requests, CPU time, and Worker Cron invocations. A small pilot should fit, but this is not production-scale hosting.

Cloudflare API structure:

- `functions/api/health.js` handles `GET /api/health`.
- `functions/api/push/public-key.js` handles `GET /api/push/public-key`.
- `functions/api/push/subscriptions.js` handles `POST /api/push/subscriptions` and `GET /api/push/subscriptions`.
- `functions/api/push/test.js` temporarily returns `501` on Cloudflare Pages.
- `functions/api/pilot-events.js` handles `POST /api/pilot-events`.
- `functions/_shared/backend.js` contains shared Supabase REST and validation helpers.

This keeps frontend calls as relative `/api/...` URLs. The Pages app and API are same-origin, so no CORS configuration is needed for normal use.

Web Push compatibility:

- Pages Functions do not send Web Push directly in CF-3. This keeps the Pages bundle free of Node built-ins such as `node:stream`, `node:crypto`, and Buffer-dependent packages.
- `POST /api/push/test` on Cloudflare Pages returns `501`: `Cloudflare Pages test push is not enabled yet; scheduled push is handled by the Cron Worker.`
- The separate reminder Cron Worker still sends scheduled Web Push and keeps its own `@block65/webcrypto-web-push` dependency and configuration.
- The Node-only `web-push` package remains for the local/Render Express backend, but it is not used by Cloudflare Pages Functions.
- Notification copy is unchanged: `Ready Checklist` and `Your weather checklist is ready.`

Root Cloudflare config:

- `wrangler.toml` sets the Pages output directory to `dist`.
- It also sets the Pages Functions compatibility date to `2024-11-01`.
- The Pages app does not enable `nodejs_compat`; these Functions use Cloudflare-compatible Web APIs to avoid Node polyfill or top-level await syntax issues during publish.
- Secrets are not stored in `wrangler.toml`.

Required Cloudflare Pages variables and secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUSH_SUBSCRIPTIONS_TABLE=push_subscriptions`
- `SUPABASE_PILOT_EVENTS_TABLE=pilot_events`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

Keep these backend-only values in Cloudflare Pages project variables/secrets. The Supabase service role key and VAPID private key must never be placed in `src/`, `index.html`, `sw.js`, `manifest.webmanifest`, or any public static file.

Cloudflare Pages deployment:

```text
Build command: npm run build:pages
Output directory: dist
Functions directory: functions
```

You can configure variables in the Cloudflare dashboard under the Pages project settings, or with Wrangler:

```sh
npx wrangler pages secret put SUPABASE_URL
npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler pages secret put VAPID_PUBLIC_KEY
npx wrangler pages secret put VAPID_PRIVATE_KEY
npx wrangler pages secret put VAPID_SUBJECT
```

Use normal non-secret variables for the table names if you do not want to rely on defaults.

Local CF-3 checks:

```sh
npm run check
npm run build:pages
npx wrangler pages dev dist --compatibility-date=2024-11-01
```

Then test:

- `http://localhost:8788/api/health`
- `http://localhost:8788/api/push/public-key`
- `POST http://localhost:8788/api/pilot-events` with a small anonymous test payload

For real scheduled push testing, use the deployed HTTPS Pages URL on iPhone and the separate Cloudflare Cron Worker. Push subscriptions are origin-bound, so local desktop testing cannot replace the iPhone installed-PWA test.

iPhone CF-3 test plan:

1. Keep Render deployed and working as fallback.
2. Deploy Cloudflare Pages with the CF-3 Functions and required variables/secrets.
3. Open the Pages HTTPS URL in iPhone Safari.
4. Delete/re-add the Home Screen PWA for the Pages URL because the origin changed from Render.
5. Open the Pages Home Screen app.
6. Enable reminders and allow notifications.
7. Confirm Supabase has a new `push_subscriptions` row for the Pages-origin PWA.
8. Confirm anonymous pilot events appear in `pilot_events`.
9. Confirm the separate Cloudflare Cron Worker sends scheduled reminders to the new Pages-origin subscription and updates `last_sent_date`.
10. Expect `POST /api/push/test` on the Pages URL to return `501` until Cloudflare Pages test push is implemented in a later stage.

Migration cautions:

- A Pages URL such as `https://ready.pages.dev` is a different origin from the Render URL.
- Existing Render-origin Home Screen installs should be removed and re-added from the Pages URL.
- Push subscriptions do not carry over between origins. Users must enable reminders again from the Pages-origin PWA.
- Old Render-origin rows may remain in Supabase until cleanup.
- Do not turn off Render until the Pages PWA, `/api/*` routes, push subscription creation, pilot events, and scheduled Cron reminders are verified.

Rollback:

1. Keep or restore the Render URL as the tester-facing URL.
2. If needed, set Cloudflare Cron `DRY_RUN=true`.
3. Keep Render scheduler disabled or re-enable it only after confirming the Cron Worker is not sending real reminders.

## Render Deployment Steps

1. Push this repo to GitHub.
2. In Render, create a new Web Service from the repo.
3. Choose the Free instance type.
4. Set the build command:

```sh
npm install
```

5. Set the start command:

```sh
npm start
```

6. Add environment variables in Render:

```text
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:you@example.com
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_backend_only_service_role_key
SUPABASE_PUSH_SUBSCRIPTIONS_TABLE=push_subscriptions
SUPABASE_PILOT_EVENTS_TABLE=pilot_events
ENABLE_EXPRESS_SCHEDULER=false
SCHEDULER_INTERVAL_MS=30000
```

Do not set `HOST` on Render unless you set it to `0.0.0.0`. Render provides `PORT` automatically, so do not hardcode `PORT`.

Set `ENABLE_EXPRESS_SCHEDULER=false` on Render when Cloudflare Worker Cron is active. This keeps the PWA and API running but prevents Render from sending duplicate scheduled reminders.

Never commit secrets. Keep `.env` local and configure hosted secrets only in the Render dashboard.

After deploy, open:

```text
https://your-service-name.onrender.com/api/health
```

Expected shape:

```json
{
  "ok": true,
  "vapidConfigured": true,
  "subscriptionStoreConfigured": true,
  "subscriptions": 0
}
```

## Run Locally

```sh
npm run dev
```

Open:

```text
http://localhost:3000
```

The Express server serves both the PWA and the `/api/push/*` endpoints, so the service worker, push subscription, and API share the same origin during local testing.

## Pre-Pilot Privacy Notes

After first use, Ready stores the last usable latitude and longitude in this browser's `localStorage` so the checklist can load automatically on future opens. This saved location stays on that device and is not persisted to Supabase.

Ready can also ask users which clothing pieces they actually wear. Clothing preferences are stored only in this browser's `localStorage` under `readyClothingPreferences`, with first-run completion tracked by `readyClothingPreferencesCompleted`. These selections are not sent to Supabase, the backend, or pilot analytics. If valid preferences are saved, Ready uses them on-device to group checklist recommendations by clothing category.

During a pilot, Ready may record basic anonymous activity events in Supabase to understand whether the app is being used. The anonymous device id is stored in localStorage. Event metadata is kept minimal and does not include exact location, names, emails, or personal identifiers.

Tracked pilot events:

- `app_opened`
- `checklist_generated`
- `checklist_completed`
- `reminders_enabled`
- `notification_clicked`
- `weather_screen_viewed`
- `location_updated`

`checklist_generated` events may include the selected `expected_time_away_hours` value and booleans for whether a personalized checklist was used. Exact clothing selections are not included.

## Clothing Preferences

New users see a local-only clothing preference screen once before the normal checklist flow. Existing users who do not have `readyClothingPreferencesCompleted` saved will also see it once after updating.

- Users can choose clothing items they actually use across Footwear, Pants, Shirts, Outerwear, and Accessories.
- Saving requires at least one selected item in each category.
- `Skip ->` bypasses validation, records the flow as completed/skipped, and keeps current default behavior unchanged.
- Saved selections can be edited later from Settings with `Edit clothing preferences`.
- Preferences stay on the current device in `localStorage`.
- Preferences are not stored in Supabase, sent to Cloudflare/Render, or included in analytics events.
- If preferences were skipped, missing, invalid, or incomplete, Ready keeps the generic flat checklist.
- If preferences are saved and valid, Ready groups checklist items by `Footwear`, `Pants`, `Shirts`, `Outerwear`, and `Accessories`.
- Clothing category headers use layer-weight labels only, such as `Shirts (Light-Medium)` or `Footwear (Heavy)`.
- Accessories can use weather-purpose labels, such as `Accessories (Rain)`, `Accessories (Sun)`, or `Accessories (Cold/Wind)`.
- If no selected item matches an important weather need, Ready uses a generic fallback, such as `Umbrella`, `Rain jacket`, `Rain boots`, or `Snow boots`.

Manual checks:

1. Clear localStorage and reload. Confirm the clothing preferences screen appears.
2. Try to save without selections and confirm a friendly validation message appears.
3. Tap `Skip ->` and confirm the normal app starts.
4. Select at least one item per category, save, refresh, and confirm selections persist when reopened from Settings.
5. Generate a checklist with saved preferences and confirm it renders grouped category sections.
6. Confirm rain/snow labels follow the rule: clothing categories use weight labels, accessories can use weather-purpose labels.
7. Confirm location, expected time away, reminders, checklist generation, and Weather still work normally.

## Expected Time Away

The Ready Checklist uses the user's expected time away from home as its forecast window. This answers: "How long will I be away from home before I get back?"

- The setting lives in Settings as `How long will you be away from home?`
- Supported values are `3`, `6`, `9`, and `12` hours.
- The default is `6` hours.
- `12` hours remains available for long days, but it is not the default because long windows can over-recommend items that feel unnecessary.
- The value is stored only in browser `localStorage`.
- It is not stored in Supabase and is separate from routine start time.
- Routine start time controls reminder timing only.
- If an older browser has `15` hours saved, the app clamps it down to `12` hours.

Ready errs on the side of practical preparedness for the time you expect to be away from home. A 9 PM check with a 3-hour window should only consider the next few nighttime hours. A 9 PM check with a 12-hour window may include daylight or later rain if the user expects to be away long enough.

Recommendation logic always builds a clothing foundation first: one flexible top item and one flexible bottom item, usually with 2-3 slash-separated options. Accessories such as rain gear, sun protection, cold accessories, and winter footwear are added only when relevant. With saved clothing preferences, that same weather judgment is mapped to the user's selected clothing and rendered as grouped category sections.

Rain handling is window-aware:

- `Umbrella / Rain Jacket` is recommended when meaningful rain risk appears inside the selected window.
- For `3` and `6` hour windows, rain chance of `40%` or higher can trigger rain gear.
- For `9` and `12` hour windows, rain chance of `35%` or higher can trigger rain gear because there is more time for the user to get caught away from home.
- Measurable rain or rain forecast codes inside the window can also trigger rain gear.
- Winter footwear is reserved for snow, freezing rain, ice risk, or near-freezing precipitation.

## Expected Time Away Test

1. Open Settings.
2. Set `How long will you be away from home?` to `3 hours`.
3. Generate or refresh the checklist.
4. Confirm the helper text says `Prepared for the next 3 hours.`
5. Change the setting to `6 hours`.
6. Confirm the checklist updates and the helper text says `Prepared for the next 6 hours.`
7. In DevTools, remove or corrupt `readyExpectedTimeAwayHours` in `localStorage`.
8. Reload the app and confirm it falls back to `6 hours`.
9. Set `readyExpectedTimeAwayHours` to `15`, reload, and confirm it clamps to `12 hours`.

Night/sun behavior to verify:

- At night with a 3-hour window, sunglasses should not appear unless daylight is inside the next 3 hours.
- At night with a 12-hour window, sunglasses can appear if daylight and sunny/warm conditions are inside the next 12 hours.
- During daytime with a 6-hour window, recommendations should use only the next 6 hours.

Synthetic recommendation examples can be run with:

```sh
npm run test:recommendations
```

The examples cover:

- Hot sunny dry weather gives flexible top and bottom options plus `Sunglasses / Hat`.
- Mild sunny weather can bridge warm and mild options like `Shorts / Cargo Pants / Jeans`.
- Mild cloudy/windy weather biases toward long sleeves, light layers, and pants.
- Rain starts 8 hours from now: umbrella appears for `9`/`12` hour windows, not `3`/`6`.
- Rain produces `Umbrella / Rain Jacket`, not waterproof or water-resistant clothing.
- Snow/freezing weather avoids shorts, tank tops, and sandals.
- Snow/freezing weather can add `Winter shoes / Snow boots`.
- Every normal forecast includes at least one top item and one bottom item without category labels.

## Testing Push

1. Open `http://localhost:3000`.
2. Open Settings.
3. Choose your expected time away if needed.
4. Choose your routine start time.
5. Tap `Enable reminders`.
6. Grant notification permission.
7. The backend saves the push subscription, routine start time, timezone, and reminder send metadata in Supabase.
8. To send a backend push immediately, run:

```sh
curl -X POST http://localhost:3000/api/push/test \
  -H "Content-Type: application/json" \
  -d "{}"
```

The `Send test` button in the app remains the Stage 6A local browser notification test.

You can inspect saved subscriptions with:

```sh
curl http://localhost:3000/api/push/subscriptions
```

## Saved Location Test

1. Open the app on a device with no saved location.
2. Tap `Use current location`.
3. Confirm the checklist appears.
4. Close and reopen the app.
5. Confirm the checklist loads automatically from the saved device location.
6. Tap `Update location` to refresh the saved device location.

## Server Restart Persistence Test

1. Run `npm run dev`.
2. Open `http://localhost:3000`.
3. Choose your routine start time.
4. Tap `Enable reminders`.
5. Confirm a subscription exists:

```sh
curl http://localhost:3000/api/push/subscriptions
```

6. Stop the server.
7. Start it again:

```sh
npm run dev
```

8. Run the subscription check again. The count should still show the saved subscription.
9. Send a backend test push:

```sh
curl -X POST http://localhost:3000/api/push/test \
  -H "Content-Type: application/json" \
  -d "{}"
```

10. To test the scheduled reminder, set the routine start time to the next `:00` or `:30` minute and keep the server running through that minute.
11. Confirm `lastSentDate` appears for that subscription after the scheduled reminder sends.
12. Keep the server running through the same minute. It should not send duplicate scheduled reminders for the same local date.

## Scheduled Reminder Behavior

In local development, the Express backend can check subscriptions every `SCHEDULER_INTERVAL_MS`.

For pilot testing on Render Free, scheduled reminders should be handled by Cloudflare Worker Cron because Render Free services can sleep. The Worker reads the same Supabase `push_subscriptions` table, checks due reminders every 5 minutes, sends Web Push, and updates `last_sent_date`.

For each subscription, it compares the current time in the user's saved IANA timezone with the saved routine start time. If the reminder is due and has not already been sent for that local date, the scheduler sends:

- Title: `Ready Checklist`
- Body: `Your weather checklist is ready.`

The notification click opens or focuses the PWA.

Changing the reminder time or timezone makes the subscription eligible for a new same-day reminder by clearing `last_sent_date`. Re-saving the same reminder time and timezone preserves `last_sent_date` so duplicate same-day reminders are still avoided.

## Cloudflare Worker Cron Scheduler

Ready includes a separate scheduler Worker in `workers/reminder-scheduler/`. This does not move the frontend or Express API to Cloudflare. Render still serves the app and API; Cloudflare only runs the scheduled reminder job.

Why it exists:

- Render Free can sleep, so its interval scheduler can miss reminder times.
- Cloudflare Cron Triggers run independently of Render being awake.
- Supabase remains the source of truth for subscriptions and `last_sent_date`.

Cost warning:

- This is designed for Cloudflare Workers Free, Supabase Free, and Render Free for a 5-10 person pilot.
- The Worker runs every 5 minutes, about 288 invocations per day.
- Workers Free has request, CPU, subrequest, and cron-trigger limits. This design is not production scale.
- Do not enable Workers Paid, paid Cloudflare storage, paid Supabase, or paid Render unless explicitly approved.

Worker secrets:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_backend_only_service_role_key
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:you@example.com
```

Worker vars:

```text
SUPABASE_PUSH_SUBSCRIPTIONS_TABLE=push_subscriptions
CRON_WINDOW_MINUTES=5
DRY_RUN=true
```

Keep `DRY_RUN=true` until Supabase reads and due-reminder detection are verified. Do not set `DRY_RUN=false` in the deployed Worker until Render has `ENABLE_EXPRESS_SCHEDULER=false`.

Local Worker test:

```sh
cd workers/reminder-scheduler
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

In another terminal:

```sh
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*"
```

With `DRY_RUN=true`, the Worker logs due reminders but does not send pushes or update `last_sent_date`.

Real Worker send test:

1. Confirm your iPhone PWA subscription exists in Supabase.
2. Set the row's `routine_start_minutes` to the next 5-minute local window.
3. Clear `last_sent_date` or set it to an earlier date.
4. Set `DRY_RUN=false` locally.
5. Trigger the local scheduled handler.
6. Confirm the iPhone receives `Ready Checklist`.
7. Confirm `last_sent_date` updates.
8. Trigger it again and confirm no duplicate sends for the same local date.

Reminder schedule update test:

1. Set a reminder time and let or simulate a send today.
2. Confirm `last_sent_date` is today's local date.
3. Change the reminder time or timezone in the app.
4. Confirm `last_sent_date` becomes `null` in Supabase.
5. Let Cron run at the new reminder time.
6. Confirm the reminder sends and `last_sent_date` updates to today's local date.
7. Re-save the same reminder time and timezone again.
8. Confirm `last_sent_date` stays today's local date and no duplicate reminder sends.

Deploy Worker in dry-run mode:

```sh
cd workers/reminder-scheduler
npm install
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
npm run deploy
```

Safe handoff order:

1. Deploy the Worker with `DRY_RUN=true`.
2. Verify the Worker can read Supabase and identify due/not-due reminders without sending.
3. Configure Render with:

```text
ENABLE_EXPRESS_SCHEDULER=false
```

4. Restart/redeploy Render and confirm logs show `Express reminder scheduler disabled by ENABLE_EXPRESS_SCHEDULER=false.`
5. Set the Worker `DRY_RUN=false` only after Render's scheduler is disabled.

This prevents duplicate scheduled reminders. Render will still serve the PWA and API routes.

To roll back:

1. Set the Worker `DRY_RUN=true` or remove the Worker Cron Trigger.
2. Set Render `ENABLE_EXPRESS_SCHEDULER=true` or remove the variable.
3. Restart/deploy Render.
4. Confirm Render logs show `Reminder scheduler running`.

## iPhone / Safari Notes

Real iPhone PWA push testing requires:

- HTTPS deployment
- PWA installed to the Home Screen
- Notification permission granted from a direct user action
- Backend reachable over HTTPS
- Valid VAPID keys configured on the backend

Localhost testing is useful on desktop browsers. iPhone testing usually needs an HTTPS tunnel or deployed HTTPS environment.

## iPhone Deployed Test Plan

1. Open the deployed `https://your-service-name.onrender.com` URL in iPhone Safari.
2. Use Safari Share, then Add to Home Screen.
3. Open Ready from the Home Screen icon.
4. Open Settings.
5. Choose your expected time away if needed.
6. Choose a routine start time.
7. Tap `Enable reminders`.
8. Allow notifications.
9. Confirm a Supabase row exists in `push_subscriptions`.
10. From your computer, send a backend test push:

```sh
curl -X POST https://your-service-name.onrender.com/api/push/test \
  -H "Content-Type: application/json" \
  -d "{}"
```

11. Confirm the notification reaches the iPhone Home Screen PWA.
12. Set the routine start time to the next `:00` or `:30` minute.
13. Keep the deployed service awake by opening the app shortly before the reminder time.
14. Confirm the scheduled notification arrives.
15. Confirm `last_sent_date` updates in Supabase.
16. Keep the app/service active through the same minute and confirm no duplicate reminder is sent for the same local date.

## PWA Cache and Icon Troubleshooting

Ready uses a service worker cache. The current strategy is:

- App shell files such as HTML, CSS, JS, and the manifest are network-first, with cached files as an offline fallback.
- Icon assets are cache-first.
- The service worker has an explicit `APP_VERSION` in `sw.js`; bump it for future app-shell deployments.
- Old caches are deleted during service worker activation.
- A newly installed service worker calls `skipWaiting()` and `clients.claim()` so fixes take control quickly.
- If an update is detected while the app is open, a small `Update available` refresh prompt appears.

Tradeoff: `skipWaiting()` and `clients.claim()` make pilot fixes appear sooner, but an open app may still need one refresh to load the newest JavaScript.

After a new deployment:

1. Open the deployed URL.
2. Confirm the app loads and the checklist button works.
3. Open `https://your-service-name.onrender.com/manifest.webmanifest` and confirm the manifest loads.
4. Open `https://your-service-name.onrender.com/icons/app-icon-180.png` and confirm the icon loads.
5. If `Update available` appears, tap `Refresh`.
6. On iPhone, open the Home Screen app and confirm the checklist still works.

If a tester sees an old version, buttons stop responding, or the Home Screen icon/name does not update:

1. Tap `Refresh` if the update prompt appears.
2. Fully close and reopen the Home Screen app.
3. Delete the installed Home Screen app.
4. In iPhone Settings, clear Safari website data for the deployed site if needed.
5. Open the deployed URL again in Safari.
6. Add Ready to the Home Screen again.

Existing installed PWAs may need to be removed and re-added before icon or app name updates appear. This is especially likely after icon changes.

## Production Notes

The current app is ready for personal testing and pre-pilot checks, but Free web hosting is still not reliable enough for a broader pilot reminder system.

Before production or a broader pilot, you will also want:

- User/account or anonymous device ownership model
- Subscription expiration cleanup
- Durable scheduler or job queue
- HTTPS hosting
- Monitoring and retry handling
- Privacy review and tester-facing consent copy
