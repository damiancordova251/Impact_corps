# Ready PWA Postmortem and Handoff

Last updated: July 19, 2026

This document summarizes what has been built so far for the Impact Corps / Ready PWA project. It is intended as a self-contained handoff for future development work.

## Recent Update ("What's New" Note on the Update Banner)

- The service-worker update-available banner (`serviceWorkerClient.js`) now shows a short "what
  changed" note underneath the Refresh button, sourced from a new `src/changelog.js` — a plain
  array of `{version, en, es}` entries, newest last. The banner always displays the last entry,
  fetched fresh via a dynamic `import()` (not the currently-running page's own stale copy), which
  works correctly under the existing network-first service-worker fetch strategy.
- **New standing convention**: whenever `sw.js`'s `APP_VERSION` is bumped for a round of changes,
  add one matching entry to `src/changelog.js` in both languages summarizing what changed for pilot
  users. A comment next to `APP_VERSION` is a reminder of this.
- Verified with a real headless-browser pass: dynamic import resolves, locale-based message
  selection works, and the banner layout (grid-based, message wraps under the Refresh button)
  renders correctly.

## Recent Update (Always-Available "Report a Problem" in Settings)

- Added a new Settings entry, `src/features/feedback/reportIssue.js`, distinct from the existing
  3-day-gated satisfaction prompt (`feedbackPrompt.js`): a "Report a problem" button is always
  visible in Settings, with no cooldown, so pilot testers can flag day-one bugs immediately instead
  of waiting three days for the scheduled prompt to appear.
- Reuses the existing `POST /api/feedback` endpoint and `feedback_submissions` table with no backend
  or schema changes — submissions are tagged `category: "issue_report"` and
  `from_scheduled_prompt: false` so they're easy to tell apart from the periodic prompt's rows in
  analytics queries.
- Verified with a real headless-browser pass (Puppeteer): button visible in Settings, modal opens,
  submission returns 204 and lands in `feedback_submissions` with the right fields, success message
  displays. Test row cleaned up afterward.

## Recent Update (Supabase Analytics Schema, Notification-Content Wiring, Forecast-Accuracy Pipeline, Referral Tracking, Full Event Instrumentation)

- Expanded Supabase schema across 8 migrations (`supabase/migrations/0001`–`0008`): `app_installations`,
  `analytics_events`, `recommendation_events`, `notification_events`, `referrals`, `referral_visits`,
  `feedback_submissions`, `client_errors`, `api_performance_events`, `forecast_predictions`,
  `forecast_actuals`, `model_change_proposals`, plus `coarse_latitude`/`coarse_longitude`/
  `preferred_language`/`installation_id` columns added to the existing `push_subscriptions`. All
  additive (`create table if not exists`/`add column if not exists`), RLS enabled with no
  `anon`/`authenticated` policies — same backend-service-role-key-only access pattern as
  `push_subscriptions`/`pilot_events`. See `supabase/README.md` and `supabase/ANALYTICS_QUERIES.md`.
- `POST /api/analytics/events` and `POST /api/feedback` (Express + Cloudflare Pages Functions) are
  now real — `src/services/analytics.js`'s `trackEvent()` and the feedback prompt actually persist,
  no longer 404ing.
- **Notification content wiring completed**: coarse location (rounded to 1 decimal degree
  client-side, in `services/notificationsApi.js`) and preferred language are captured on subscribe.
  Both `workers/reminder-scheduler` and `server/pushService.js` fetch a small Open-Meteo summary at
  send time and pick a bilingual, weather-aware message variant via `server/notificationCopy.js`
  (duplicated into the Worker runtime), falling back to the existing generic message on missing
  location or any failure.
- **New `workers/forecast-tracker` Cloudflare Worker** (own `wrangler.toml`/`package.json`,
  `DRY_RUN=true` default): every 30 minutes, snapshots Open-Meteo predictions (6h/12h/24h horizons)
  for the distinct coarse locations currently present in `push_subscriptions` into
  `forecast_predictions`, and records observed conditions for predictions whose `target_time` has
  passed into `forecast_actuals` with computed error columns. This is accuracy-monitoring only —
  nothing here ever changes `domain/recommendation.js`; any proposed threshold change belongs in a
  manually-reviewed `model_change_proposals` row.
- **Referral tracking is now real**, not just a generic share link: `src/services/referralApi.js`
  fetches/generates a per-installation referral code (`POST /api/referrals/code`),
  `shareFab.js` embeds it in the share link as `?ref=CODE`, landing on that link logs a visit
  (`POST /api/referrals/visits`), and completing onboarding marks that visit converted and tags the
  new installation with the referring code (`POST /api/referrals/visits/:id/convert`).
- **`notification_events` now records the full delivery lifecycle**: scheduled/delivered are
  recorded at send time (both `server/pushService.js` and `workers/reminder-scheduler` call this
  before the actual push send), and opened/dismissed are reported back by `sw.js`'s
  `notificationclick`/`notificationclose` handlers (`POST /api/notifications/events/:id/opened`
  `|dismissed`). Requires the new `push_subscriptions.installation_id` column (migration 0008) to
  link a subscription back to its anonymous installation id.
- A global client-side error handler (`src/utils/errorReporting.js`, initialized first thing in
  `app.js`) catches `window.onerror`/`unhandledrejection` and posts to the dedicated `client_errors`
  table, capped at 20 reports per session.
- `api_performance_events` gets one real call site: the weather/recommendation Open-Meteo fetch in
  `src/services/weather.js` is timed and reported.
- The rich, typed `recommendation_events` table (weather conditions, items, personalized flag,
  generation time) is now populated alongside the existing flat `recommendation_generated` analytics
  event, at the same `renderWindowRecommendation()` call site.
- The feedback prompt also gained an optional "what other clothing options would you like to see?"
  question (`feedback_submissions.clothing_suggestions`).
- All of the above was verified live against the real Supabase project (all 8 migrations applied via
  the SQL Editor) with real requests to every new endpoint, a real (temporarily-non-dry-run, then
  reverted) `forecast-tracker` run against real Open-Meteo data, and full cleanup of every
  test-created row afterward; the real pilot `push_subscriptions` rows were confirmed untouched
  throughout.
- **Still requires a manual deploy step before any of this is live**: this environment has no
  Cloudflare login (`wrangler whoami` fails), so neither `workers/reminder-scheduler` (updated with
  the weather-aware copy and `notification_events` recording) nor the brand-new
  `workers/forecast-tracker` has been deployed. Until `wrangler deploy` is run for both, reminders
  keep sending the old generic text and no forecast-accuracy data is collected. Cloudflare Pages (the
  static site and `functions/`) auto-deploys from `main`, so everything else in this list is already
  live.

## Recent Update (Modularization, Referral Share, Notification Toggle, Icon Polish)

- The frontend was reorganized from one 1667-line `src/app.js` into feature-scoped modules under `src/{constants,state,dom,utils,services,domain,features}/`. `src/app.js` is now a thin bootstrap. See the updated "Files Worth Knowing" list below for the new paths.
- A referral/share feature was added: a floating share button (`src/features/share/shareFab.js`) opens a confirmation modal, then uses the native Web Share API where available, falling back to clipboard copy (and, as a last resort, showing the message inline for manual copy). The shared link is always `window.location.origin`, never a hardcoded domain, since Render and Cloudflare Pages are different origins.
- Reminder notifications can now be turned off, not just on. The Settings button toggles between "Enable reminders" / "Disable reminders"; disabling unsubscribes the browser `PushSubscription` and deletes the matching Supabase row via a new `DELETE /api/push/subscriptions/:id` route (added to both the Express server and Cloudflare Pages Functions at `functions/api/push/subscriptions/[id].js`). This is what actually cancels scheduled reminders, not just local UI state.
- The app icon's top strap-loop arc was recentered (it was 18px off from the body's true center) so the backpack mark is symmetric; PNGs are regenerated from the SVG via `npm run generate:icons` (uses `sharp`, a new devDependency). A later pass reverted the checkmark/clasp edits from that round and instead smoothed the side straps' attachment to the body (they met the wall via a straight connector, creating a hard right-angle notch — replaced with a continuous curve).
- The share button was nudged down slightly (`bottom: 76px` instead of `88px`).

## Recent Update (English/Spanish i18n, Feedback Prompt, Notification Content Groundwork)

- Full English/Spanish i18n: a hand-built `src/i18n/` (no dependency — plain `.js` translation
  objects rather than `.json` module imports, since Safari's support for JSON import attributes is
  inconsistent across this pilot's target iOS versions). `t(key, params)` does dot-path lookup with
  `{param}` substitution; `getLocale()`/`setLocale()` persist to `readyLanguage` in localStorage,
  falling back to browser-language detection, then English. Switching language saves the
  preference and reloads (deliberately not a live in-place re-render — see the comment in
  `src/features/settings/language.js` for why). A language `<select>` lives at the bottom of
  Settings.
- `domain/recommendation.js`'s output shape changed from pre-formatted English strings to
  structured, translatable descriptors (`{type: "clothingGroup", category, weightLabel, options}` /
  `{type: "accessory", options}` for items; `{key, params}` for reasons) — `features/checklist/checklist.js`
  composes and translates at render time via `src/i18n/domainStrings.js`, a lookup dictionary that
  translates canonical clothing-item/weight/purpose-label strings for *display* only, keeping the
  actual stored/canonical strings in English so existing users' saved clothing preferences in
  localStorage never need migrating. `tests/recommendation.test.js` was updated to assert against
  the new structured shape instead of composed strings.
- A three-day feedback prompt (`src/features/feedback/feedbackPrompt.js`) shows once a user has
  opened the app on 3 distinct calendar days (tracked locally), gated behind onboarding-complete
  and a cooldown after "Remind me later" (3 days) or dismiss (14 days). It posts to `POST
  /api/feedback`, which does not exist yet — see below.
- `server/notificationCopy.js`: a pure, dependency-free module that picks one of a small set of
  bilingual, weather-aware scheduled-reminder message variants (rain/cold/warm/generic) from a
  coarse weather summary. Deliberately **not wired into `server/pushService.js` or the Cloudflare
  Worker yet** — that requires the scheduler to have a coarse location to fetch weather from at
  send time, which is part of the deferred Supabase schema work below.
- **Deferred (by explicit request) to a follow-up round, discussed together:** the expanded
  Supabase analytics schema (installations/sessions/events/recommendations/notifications/referrals/
  feedback/errors tables, RLS, migrations, `POST /api/analytics/events` and `POST /api/feedback`
  backend endpoints) and the weather forecast-accuracy pipeline (including the coarse-location
  columns on `push_subscriptions` needed to actually wire up `notificationCopy.js`). Until that
  lands, `src/services/analytics.js`'s `trackEvent()` and the feedback prompt's submit both hit
  404s gracefully (fire-and-forget / friendly failure message, never a crash) — nothing is actually
  being recorded yet.
- See `PRE_REFERRAL_REVIEW.md` for a prioritized list of what else is worth addressing before a
  wider pilot.

## Executive Summary

Ready is a mobile-first PWA that turns local weather into a practical clothing checklist. The original product idea was called Morning Wear and focused on reducing morning decision stress. The product has since evolved into Ready: a broader preparation tool that helps users decide what to wear or bring for the amount of time they expect to be away from home.

The current app supports:

- First-run onboarding.
- Saved local location reuse.
- Weather-based Ready Checklist generation.
- Weather details screen.
- Expected time away setting.
- Routine reminder time setting.
- Local-only clothing preferences.
- Personalized grouped checklist categories.
- PWA installability and service worker caching.
- Browser notifications and Web Push foundations.
- Persistent Supabase push subscription storage.
- Anonymous pilot activity tracking.
- Render deployment fallback.
- Cloudflare Pages static/API migration work.
- Cloudflare Worker Cron scheduled reminders.

The project is suitable for continued personal testing and careful pre-pilot testing. It is not yet a production system.

## Product Goal

Ready exists to answer one practical question:

> What should I wear or bring for the weather I am likely to run into today?

The product deliberately avoids feeling like a full weather dashboard. Weather details exist, but the main experience is the checklist.

The core user problem:

- Weather apps show numbers and probabilities.
- Users still have to translate those numbers into clothing decisions.
- That translation is annoying under time pressure.
- Forgetting an umbrella, layer, or cold-weather accessory can make the day worse.

Ready's product principle:

> Ready errs on the side of practical preparedness for the time the user expects to be away from home.

## Current Product State

### Main User Experience

The app opens to a Ready Checklist screen. The checklist is generated from:

- The user's saved or current device location.
- Open-Meteo weather data.
- The user's selected expected time away.
- The recommendation engine.
- Optional local clothing preferences.

The user can swipe or tap to a Weather Details screen for:

- Current temperature.
- High / low.
- Feels-like temperature.
- Rain chance.
- Current precipitation.
- Wind.
- Conditions.
- Last updated time.

### First-Run Onboarding

New users see a setup flow before their first checklist.

Onboarding collects or confirms:

- Location.
- Usual leave / reminder time.
- Expected time away.
- Clothing preferences.
- Optional reminders.

Local storage key:

- `readyOnboardingCompleted`

Supporting in-progress key:

- `readyOnboardingStarted`

Existing testers are not trapped in the onboarding flow. If onboarding is missing but the device already has saved setup data, such as saved location or completed clothing preferences, the app marks onboarding complete and starts normally.

Location is the only required onboarding step. Other setup steps can be skipped or defaulted.

Onboarding defaults:

- Routine / reminder time: `6:00 AM`
- Expected time away: `9 hours`
- Clothing preferences: skipped, using default grouped checklist items
- Reminders: disabled unless the user explicitly enables them

The current checklist creation/loading step is intentionally simple:

- Title: `Creating your checklist`
- Subtext: `Checking weather, layers, and accessories...`
- A thin green CSS-only progress bar
- No animated app icon, orbit, ring, bouncing, spinning, or flashing dot

### Saved Location

After successful location permission, Ready saves the last usable latitude and longitude in browser `localStorage`.

Local storage key:

- `readySavedLocation`

Important privacy rule:

- Exact location is not stored in Supabase.
- Exact location is not sent to the backend for persistence.
- Location is only used locally to fetch weather.

On future app opens, if saved location is valid, Ready automatically generates a checklist without requiring the user to tap `Use current location` again.

### Expected Time Away

The app no longer uses a fixed next-12-hours checklist window for every user.

Setting:

- `How long will you be away from home?`

Allowed values:

- `3 hours`
- `6 hours`
- `9 hours`
- `12 hours`

Storage:

- `readyExpectedTimeAwayHours` in `localStorage`

Current normal fallback:

- `6 hours`

Onboarding default:

- `9 hours`

Legacy behavior:

- A saved `15 hours` value is clamped down to `12 hours`.

This setting controls recommendation accuracy. It is separate from routine/reminder time.

### Routine Reminder Time

The routine/reminder setting controls when scheduled reminders should arrive.

Storage:

- `morningWearRoutineStartMinutes`
- Legacy fallback key: `morningWearWakeTimeMinutes`

Default:

- `6:00 AM`

This setting is not used to decide the forecast window. It only controls reminder timing.

### Clothing Preferences

Stage A added local-only clothing preferences. Users can choose clothing they actually wear across:

- Footwear
- Pants
- Shirts
- Outerwear
- Accessories

Storage:

- `readyClothingPreferences`
- `readyClothingPreferencesCompleted`

Completion states:

- `saved`
- `skipped`

Privacy rule:

- Exact clothing selections stay local.
- They are not sent to Supabase.
- They are not sent to Cloudflare or Render.
- They are not included in analytics.

Settings includes an `Edit clothing preferences` button. Saving preferences from Settings immediately re-renders the visible checklist if weather data is already loaded.

### Personalized Grouped Checklist

Stage B changed checklist display from a flat list into grouped categories.

Current grouped categories:

- Footwear
- Pants
- Shirts
- Outerwear
- Accessories

If the user saved valid preferences:

- Ready maps weather needs to selected clothing items.
- Only compatible selected items appear when possible.
- The checklist stays concise, usually 1-3 items per category.
- If no selected item fits an important need, Ready first uses the closest selected same-category item with a small warning when useful.
- If there is no same-category selection, Ready uses a default/generic fallback.

If the user skipped preferences or has invalid/incomplete preferences:

- Ready still uses grouped checklist layout.
- It uses a default clothing pool.

Completion rule:

- Grouped checklist sections are alternatives.
- The checklist is complete when the user checks at least one item in every visible category.
- The old flat all-checkboxes behavior remains only as an emergency fallback.

Category label rules:

- Footwear, Pants, Shirts, and Outerwear use layer-weight labels only:
  - `Light`
  - `Light-Medium`
  - `Medium`
  - `Medium-Heavy`
  - `Heavy`
- Accessories can use purpose labels:
  - `Rain`
  - `Snow`
  - `Sun`
  - `Wind`
  - `Cold`
  - combined labels such as `Cold/Wind`

Warning behavior:

- Rain warnings are intentionally narrow.
- Footwear can show `May not be ideal for rain.`
- Shirts, Pants, Outerwear, and Accessories do not show broad rain mismatch warnings.
- Accessories generally avoid unnecessary rain/sun warnings because they are already purpose-based.

## Recommendation Logic

The recommendation engine lives in `src/recommendation.js`.

Key concepts:

- `getNextForecastWindow()` selects the next N hours based on expected time away.
- `buildWindowWeather()` summarizes the selected forecast window.
- `createRecommendation()` converts summarized weather into checklist needs and generic fallback items.
- `src/personalizedChecklist.js` maps those weather needs to selected/default clothing items.

The recommendation logic considers:

- Min/max temperature.
- Feels-like temperature.
- Rain chance and measurable precipitation.
- Rain, snow, freezing rain, and weather codes.
- Wind.
- Cloud/sun/daylight conditions.
- Expected time away duration.

Current rain behavior:

- For 3- and 6-hour windows, rain chance around 40% can trigger rain gear.
- For 9- and 12-hour windows, rain chance around 35% can trigger rain gear.
- Measurable rain or rain forecast codes can also trigger rain gear.
- Longer windows are more cautious because the user has more time to get caught away from home.

Important item behavior:

- Rain uses `Umbrella / Rain Jacket` in generic mode.
- Snow/freezing can add winter footwear.
- Sun accessories appear only when bright/sunny daytime conditions occur inside the selected window.
- Shorts/tank tops are avoided in snow/freezing/cold rain.
- Shoes are not a default category; footwear is shown conditionally through grouped personalization/defaults.

## PWA and Visual Polish

The app was renamed from Morning Wear to Ready.

Updated branding:

- Manifest `name`: `Ready`
- Manifest `short_name`: `Ready`
- Apple mobile web app title: `Ready`
- Visible app name: `Ready`
- Checklist title remains `Ready Checklist:`
- Notification title remains `Ready Checklist`

Icon work:

- The final app icon uses a dark navy rounded-square background.
- The icon mark is a white backpack/bag outline with a teal checkmark.
- A single source SVG is used:
  - `icons/app-icon.svg`
- PNG exports exist:
  - `icons/app-icon-180.png`
  - `icons/app-icon-192.png`
  - `icons/app-icon-512.png`

Icon references:

- `index.html`
- `manifest.webmanifest`
- `sw.js`
- notification icon/badge paths

Loading/onboarding animation work:

- Earlier animated orbit/dot treatments were removed.
- The welcome icon is now static.
- The checklist creation state uses a minimal horizontal progress bar.
- Reduced-motion users receive static loading treatment.

## Service Worker and Cache Behavior

The service worker is `sw.js`.

Current strategy:

- App shell files use network-first caching.
- Icons use cache-first behavior.
- Old caches are deleted on activation.
- `skipWaiting()` and `clients.claim()` are used so pilot fixes take effect faster.
- A small update banner can prompt refresh when a new service worker version is available.

Current cache version:

- `welcome-icon-static`

Important operational note:

- Bump `APP_VERSION` in `sw.js` whenever frontend HTML/CSS/JS/icon cache behavior changes.
- Existing installed iPhone PWAs may need to be removed and re-added for icon/name updates.

## Notifications and Web Push

The notification copy is intentionally unchanged:

- Title: `Ready Checklist`
- Body: `Your weather checklist is ready.`

Frontend notification modules:

- `src/notifications.js`
- `src/reminders.js`

The app supports:

- Browser notification capability detection.
- iPhone Home Screen PWA notification guidance.
- Notification permission request.
- Local test notification.
- Push subscription creation.
- Push subscription sync to backend.
- Notification click tracking.

The service worker handles:

- Push events.
- Notification display.
- Notification click focus/open behavior.

## Backend and Persistence

### Express Backend

The Express backend lives in `server/`.

It handles:

- Static PWA serving.
- `/api/health`
- `/api/push/public-key`
- `/api/push/subscriptions`
- `/api/push/test`
- `/api/pilot-events`
- optional local/Render scheduled reminder loop

Important files:

- `server/index.js`
- `server/subscriptionStore.js`
- `server/pilotEventStore.js`
- `server/pushService.js`
- `server/scheduler.js`
- `server/time.js`

### Supabase Storage

Stage 7B replaced in-memory push subscription storage with Supabase/Postgres.

Persisted push subscription fields:

- `id`
- push subscription JSON
- routine start time in minutes
- timezone
- last sent date
- created timestamp
- updated timestamp

Privacy rule:

- Do not persist exact location.
- Do not persist clothing preferences.
- Do not add accounts/auth yet.

The backend uses the Supabase service role key only server-side. It must never appear in frontend JavaScript.

### Reminder Update Rule

The reminder storage layer handles same-day schedule changes:

- If routine time changes, `last_sent_date` resets to `null`.
- If timezone changes, `last_sent_date` resets to `null`.
- If the same routine time/timezone is re-saved, `last_sent_date` is preserved.

This lets a user change their reminder time and receive a new same-day reminder without allowing duplicate reminders from repeated saves.

## Pilot Analytics

Pilot analytics are intentionally minimal.

Stored table:

- `pilot_events`

Tracked event types:

- `app_opened`
- `checklist_generated`
- `checklist_completed`
- `reminders_enabled`
- `notification_clicked`
- `weather_screen_viewed`
- `location_updated`

Privacy rules:

- Anonymous device id only.
- No names.
- No emails.
- No exact location.
- No exact clothing preferences.
- No accounts.

`checklist_generated` can include:

- `expected_time_away_hours`
- `has_clothing_preferences`
- `personalized_checklist`

Analytics failures are soft. They should never break checklist generation.

## Deployment Work

### Render

Stage 7C prepared and tested Render deployment for personal iPhone testing.

Render role:

- Serves the PWA and Express API.
- Works as fallback during Cloudflare migration.

Free-tier limitation:

- Render Free can sleep.
- Sleeping can cause missed scheduled reminders.

Scheduler control:

- `ENABLE_EXPRESS_SCHEDULER=true` enables Express scheduler.
- `ENABLE_EXPRESS_SCHEDULER=false` disables Express scheduler.

This flag is critical to avoid duplicate reminders when Cloudflare Worker Cron is active.

### Cloudflare Worker Cron

The reminder scheduler Worker lives in:

- `workers/reminder-scheduler/`

Purpose:

- Move scheduled reminder delivery off Render Free.
- Run every 5 minutes via Cloudflare Cron Trigger.
- Read Supabase subscriptions.
- Determine due reminders using timezone and routine start time.
- Skip reminders already sent for the user's local date.
- Send Web Push.
- Update `last_sent_date`.
- Remove expired subscriptions on 404/410 when possible.

The Worker uses:

- `@block65/webcrypto-web-push`

Reason:

- The Node `web-push` package is not Cloudflare Worker safe.
- Worker Web Push must use Web Crypto compatible APIs.

Safe handoff order:

1. Deploy Worker with `DRY_RUN=true`.
2. Verify Supabase reads and due-reminder detection.
3. Set Render `ENABLE_EXPRESS_SCHEDULER=false`.
4. Confirm Render logs show the scheduler is disabled.
5. Set Worker `DRY_RUN=false`.

### Cloudflare Pages CF-2

CF-2 added a clean static export for Cloudflare Pages.

Script:

- `npm run build:pages`

Build script:

- `scripts/build-pages.js`

Output:

- `dist/`

Only frontend assets are copied:

- `index.html`
- `styles.css`
- `src/`
- `icons/`
- `manifest.webmanifest`
- `sw.js`

Backend/server/secrets are intentionally not copied.

### Cloudflare Pages CF-3

CF-3 moved API behavior to Cloudflare Pages Functions.

Functions:

- `functions/api/health.js`
- `functions/api/push/public-key.js`
- `functions/api/push/subscriptions.js`
- `functions/api/push/test.js`
- `functions/api/pilot-events.js`

Shared helpers:

- `functions/_shared/backend.js`

Important compatibility decision:

- Pages Functions use native `fetch` to call Supabase REST.
- Pages Functions do not import `@supabase/supabase-js`.
- Pages Functions do not import Node-only `web-push`.
- This avoids `node:stream`, `node:crypto`, Buffer, and Node polyfill issues.

Current Cloudflare Pages test push limitation:

- `POST /api/push/test` returns `501`.
- Scheduled push is handled by the separate Cron Worker.

## Testing and Verification

Current scripts:

- `npm run check`
- `npm run build:pages`
- `npm run test:recommendations`

`npm run check` syntax-checks:

- Express server files.
- frontend modules.
- recommendation tests.
- personalized checklist tests.
- Cloudflare Pages Functions.
- Cloudflare Worker scheduler.
- service worker.

Recommendation tests cover:

- Time-away windows.
- Rain later in the selected window.
- Rain thresholds.
- Hot/sunny weather.
- Mild weather.
- Cloudy/windy weather.
- Snow/freezing behavior.
- Grouped personalized checklist examples.
- Warning behavior.
- Default/skipped preference behavior.

Manual tests that have been confirmed over the project:

- Local Ready Checklist generation.
- Weather details screen.
- Routine start time setting.
- Test notifications.
- Backend Web Push locally.
- Scheduled reminders locally.
- Supabase persistence across server restart.
- iPhone Home Screen PWA through Cloudflare Tunnel.
- iPhone location permission.
- iPhone notification permission.
- Backend push reaching iPhone through tunnel.
- Render deployment.
- Cloudflare Pages deploy after CF-2/CF-3 fixes.

Manual tests still important after latest visual/onboarding changes:

- Clear localStorage and confirm first-run onboarding.
- Confirm static welcome icon.
- Confirm no orbit/dot/ring animation.
- Confirm progress-bar checklist creation state.
- Confirm final checklist renders.
- Confirm Settings still edits preferences/time/reminders.
- Confirm iPhone Home Screen PWA layout.

## Important Bugs Fixed

### In-memory Subscription Loss

Problem:

- Push subscriptions were originally stored in memory.
- Server restart erased subscriptions.

Fix:

- Supabase persistent storage.

### Render Scheduler Sleep

Problem:

- Render Free can sleep.
- Express interval scheduler can miss reminder times.

Fix:

- Cloudflare Worker Cron scheduler.
- Express scheduler can be disabled with `ENABLE_EXPRESS_SCHEDULER=false`.

### Duplicate Reminder Risk

Problem:

- Render scheduler and Worker scheduler could both send reminders.

Fix:

- Explicit scheduler handoff order.
- `ENABLE_EXPRESS_SCHEDULER=false`.
- Worker `DRY_RUN` safety mode.

### Same-Day Reminder Time Change

Problem:

- If a reminder had already been sent today, changing reminder time did not allow a new same-day reminder.

Fix:

- Reset `last_sent_date` to `null` when routine time or timezone changes.

### Cloudflare Pages Function Syntax Errors

Problems:

- Broken comment/text in `functions/_shared/backend.js`.
- Broken multiline string.
- `npm run check` did not originally cover all Functions files.

Fix:

- Fixed syntax.
- Expanded check script to include Functions.

### Node-only Imports in Pages Functions

Problem:

- Pages Functions bundle tried to import `node:stream`.

Fix:

- Removed Node-only dependencies from Pages Functions.
- Used native fetch/Supabase REST for Pages Functions.
- Disabled Pages test push with 501 until Worker-safe test push is implemented.

### Cloudflare Env Debugging

Problem:

- Production `/api/health` showed missing env config.

Fix:

- Added safe boolean env diagnostics to `/api/health`.
- No secret values are returned.

### Service Worker Staleness

Problem:

- Deployed app once required manual cache clearing before buttons worked.

Fix:

- Explicit cache versioning.
- Old cache cleanup.
- Network-first app shell.
- Update banner.
- Frequent `APP_VERSION` bumps after frontend changes.

### Home Screen Icon Mismatch

Problem:

- iPhone PWA icon and in-app icon did not match.
- Earlier icon versions had unwanted background treatments.

Fix:

- Single source SVG.
- PNG exports from same design.
- References aligned across manifest, apple touch icon, in-app icon, notification icon/badge.

### Overbroad Rain Warnings

Problem:

- Rain mismatch warnings appeared across many categories.

Fix:

- Rain warnings are now limited to Footwear closest-match cases.

### Loading/Welcome Animation Polish

Problem:

- App icon loading/welcome animations felt busy or broken.

Fix:

- Checklist creation uses a simple progress bar.
- Welcome icon is static.
- Orbit/ring/dot animations were removed from the welcome icon.

## Key Product Decisions

### Checklist First

The app should answer what to wear/bring before showing weather facts.

### Weather Details Are Secondary

The Weather screen exists for trust and context, but it is not the primary experience.

### Expected Time Away Beats Fixed 12 Hours

The app became more trustworthy once recommendations matched the user's expected time away rather than an arbitrary fixed window.

### Routine Time Is Not Forecast Window

Routine time controls reminders only.

Expected time away controls recommendation logic.

### Local-Only Personalization First

Clothing preferences are useful without accounts or backend identity.

The current privacy-preserving approach is:

- Store preferences locally.
- Do not send exact selections anywhere.
- Use defaults when skipped.

### Free-Tier Pilot Bias

The project consistently chose free or low-cost infrastructure:

- Supabase Free.
- Render Free for fallback/personal hosting.
- Cloudflare Pages Free.
- Cloudflare Workers Free.

Tradeoff:

- Good for pilot testing.
- Not yet production durable.

## Current Architecture

Frontend:

- Static PWA.
- Vanilla HTML/CSS/JavaScript.
- No frontend build framework.
- Open-Meteo weather fetch from browser.
- LocalStorage for device-local preferences.

Backend/Fallback:

- Express server for local/Render.
- Serves static PWA and API routes.
- Node `web-push` for Express push test/send.

Cloudflare Pages:

- Static PWA from `dist/`.
- Pages Functions for same-origin `/api/*`.
- Supabase REST via native fetch.

Cloudflare Worker:

- Cron scheduler for reminders.
- Worker-compatible Web Push.

Database:

- Supabase/Postgres.
- `push_subscriptions`.
- `pilot_events`.

## Privacy Model

Stored locally only:

- Exact location.
- Clothing preferences.
- Expected time away.
- Onboarding completion.
- Anonymous pilot device id.

Stored in Supabase:

- Push subscription JSON.
- Routine start minutes.
- Timezone.
- Last reminder sent date.
- Anonymous pilot event rows.

Not stored:

- User names.
- Emails.
- Accounts.
- Exact clothing selections.
- Exact location.

Backend-only secrets:

- Supabase service role key.
- VAPID private key.

## Known Limitations

### No Accounts/Auth

There is no durable user identity beyond local browser/device state and anonymous push subscriptions.

### Origin-Bound Push Subscriptions

Moving between Render and Cloudflare Pages creates a new origin.

Users must:

- Reinstall the Home Screen PWA for the new origin.
- Re-enable reminders.

Old Supabase rows may remain until cleanup.

### Cloudflare Pages Test Push Not Implemented

Cloudflare Pages `/api/push/test` currently returns `501`.

Scheduled Web Push is handled by the Cron Worker.

### Free Hosting Is Not Production Reliability

Free tiers can have:

- Sleep behavior.
- Invocation limits.
- Build limits.
- Paused projects after inactivity.

This is acceptable for careful pilot testing, not production guarantees.

### No Production Monitoring

There is no robust monitoring/alerting for:

- Missed reminders.
- Worker failures.
- Supabase errors.
- Push delivery failures.

### Weather Logic Is Rule-Based

The recommendation system is deterministic and transparent, but it is still hand-tuned.

More pilot feedback is needed to tune thresholds.

### Clothing Personalization Is Local Only

This is good for privacy, but it means:

- Preferences do not sync across devices.
- Clearing browser data resets preferences.

## Files Worth Knowing

Frontend (modularized; `src/app.js` is now a thin bootstrap that wires the
modules below together):

- `index.html`
- `styles.css`
- `src/app.js`
- `src/config.js`
- `src/constants/storageKeys.js`
- `src/state/appState.js`
- `src/dom/elements.js`
- `src/utils/format.js`, `src/utils/browser.js`
- `src/services/weather.js`, `location.js`, `notificationsApi.js`, `pilotAnalytics.js`
- `src/domain/recommendation.js`, `personalizedChecklist.js`, `clothingPreferences.js`, `reminders.js`
- `src/features/onboarding/onboarding.js`
- `src/features/checklist/checklist.js`
- `src/features/weatherScreen/weatherScreen.js`
- `src/features/settings/timeAway.js`, `routineStart.js`
- `src/features/notifications/notificationSettings.js`
- `src/features/clothingPreferences/clothingPreferencesUI.js`
- `src/features/share/shareFab.js`
- `src/features/pwa/serviceWorkerClient.js`

PWA:

- `manifest.webmanifest`
- `sw.js`
- `icons/app-icon.svg`
- `icons/app-icon-180.png`
- `icons/app-icon-192.png`
- `icons/app-icon-512.png`

Express:

- `server/index.js`
- `server/subscriptionStore.js`
- `server/pilotEventStore.js`
- `server/pushService.js`
- `server/scheduler.js`
- `server/time.js`

Cloudflare Pages Functions:

- `functions/_shared/backend.js`
- `functions/api/health.js`
- `functions/api/push/public-key.js`
- `functions/api/push/subscriptions.js`
- `functions/api/push/test.js`
- `functions/api/pilot-events.js`

Cloudflare Worker Cron:

- `workers/reminder-scheduler/src/index.js`
- `workers/reminder-scheduler/README.md`
- `workers/reminder-scheduler/wrangler.toml`

Build/config:

- `scripts/build-pages.js`
- `package.json`
- `wrangler.toml`
- `.env.example`

Tests:

- `tests/recommendation.test.js`
- `tests/personalizedChecklist.test.js`

## Recommended Next Steps

### 1. Manual Onboarding QA

Clear localStorage and test the complete first-run flow on:

- Desktop browser.
- iPhone Safari.
- iPhone Home Screen PWA.

Focus on:

- Location failure handling.
- Skip setup behavior.
- Clothing preference save/skip.
- Reminder enable/not-now.
- Final checklist generation.

### 2. Cloudflare End-to-End Pilot Test

Verify the Pages-origin flow:

- Open Pages URL.
- Install Home Screen PWA.
- Enable reminders.
- Confirm Supabase row.
- Confirm Cron Worker sends scheduled reminder.
- Confirm `last_sent_date` updates.

### 3. Subscription Cleanup Plan

Design a safe way to remove old/stale subscriptions, especially after origin migration.

### 4. Pilot Feedback Round

Collect feedback on:

- Are recommendations useful?
- Are warning messages helpful or annoying?
- Does expected time away make sense?
- Does grouped category completion feel intuitive?
- Are reminders arriving at the right time?

### 5. Production Readiness Later

Before a larger launch, consider:

- Monitoring.
- Better retry handling.
- More durable identity/device model.
- Privacy policy/consent copy.
- Subscription lifecycle cleanup.
- More weather threshold tuning.

## Current Verification Commands

Run before handing off or deploying:

```sh
npm run check
npm run build:pages
npm run test:recommendations
git diff --check
```

## Current Bottom Line

Ready has moved from a basic weather-to-clothing prototype into a pilot-ready PWA architecture with local personalization, persistent push subscription storage, Cloudflare-compatible API work, and a more reliable Worker-based scheduled reminder path.

The largest remaining risks are not core product functionality. They are deployment/pilot operations:

- origin migration,
- push subscription lifecycle,
- free-tier reliability,
- stale PWA caches,
- and real-world recommendation tuning.

The app is ready for careful personal and small pilot testing, as long as those limitations are understood.
