# Morning Wear / Impact Corps PWA Post-Mortem

This document summarizes the Morning Wear / Impact Corps PWA build from the original product idea through the current Web Push prototype. It is written to be self-contained for a future Codex chat that has access to this repository but not the original development conversation.

Sources used:

- Impact Corps PRD / planning document: `/Users/damian/Downloads/Impact Corps_ Notes, Research. etc..md`
- Current codebase
- Git history through `stage_6B`
- `README.md`
- Stage 7A testing context provided by the product manager/director

## 1. Original Product Goal

The original goal was to reduce morning decision stress by turning weather information into a fast, plain recommendation for what to wear or bring.

The PRD framed the core pain point clearly: existing weather apps show numbers, percentages, and conditions, but they do not directly answer the practical question a rushed person has in the morning: "What should I wear or bring when I leave?"

Target beneficiary in the PRD:

- A busy parent, specifically a mom of four, who has to get herself and children ready in a time-constrained morning routine.
- The broader beneficiary also includes students, commuters, people who recently moved to a new climate, and anyone who gets overwhelmed by weather details when deciding what to wear.

Pain point:

- People often bring too much, too little, or forget the important item, such as an umbrella or jacket.
- People may check weather apps but not translate rain probability, wind, feels-like temperature, or daily high/low into clothing decisions.
- Morning decisions happen under time pressure, so even small ambiguity adds cognitive load.

The product is intended to make weather preparation routine instead of stressful. The app should be useful because it removes interpretation work: the user should see a checklist and leave prepared.

## 2. Theory of Change

Input:

- User GPS location
- Weather forecast data
- User routine start time
- Later, optional user feedback and personalization

Activity:

- Fetch local weather.
- Convert forecast data into simple clothing/accessory rules.
- Present only the items the user should wear or bring.
- Send a reminder at the user's routine start time.

Output:

- A clear Ready Checklist, such as `Umbrella`, `Light jacket`, or `Gloves`.
- A simple weather details screen for users who want context.
- A daily notification that prompts the user to open the app.

Outcome:

- The user spends less mental energy interpreting weather.
- The user is more likely to leave with appropriate clothing/accessories.
- The app becomes part of the user's morning routine.

Impact:

- Fewer stressful weather mistakes.
- Fewer forgotten umbrellas, missing layers, or avoidable discomfort.
- A calmer morning because one small but recurring decision is handled.

## 3. What We Built

Current product summary:

- A mobile-first PWA called Morning Wear.
- A default Checklist screen titled `Ready Checklist:`.
- A second Weather details screen.
- Swipe/trackpad-friendly horizontal navigation between Checklist and Weather.
- GPS-based weather fetch through Open-Meteo.
- A 12-hour rolling forecast window for checklist recommendations.
- Expanded clothing/accessory recommendation rules.
- A routine start time setting stored in `localStorage`.
- Service worker caching for PWA behavior.
- Notification permission flow.
- Local test notification flow.
- Service worker notification click handling.
- Service worker real push handling.
- Minimal Express backend for Web Push subscription storage and scheduled reminders.
- VAPID key setup through environment variables.
- In-memory backend subscription store.
- Simple scheduler that checks saved subscriptions and sends reminders at the user's saved routine start time in the user's timezone.
- Confirmed personal iPhone testing through a temporary HTTPS tunnel:
  - PWA installed to iPhone Home Screen.
  - Location permission worked.
  - Notification permission worked.
  - Backend push notification worked on iPhone.

The notification currently says:

- Title: `Ready Checklist`
- Body: `Your weather checklist is ready.`

The notification intentionally does not include the full checklist yet. It opens/focuses the app, and the app generates the current Ready Checklist.

## 4. Stage-by-Stage Build History

### Stage 1: Initial PWA Prototype

Goal:

- Prove the core value: GPS location to weather data to a simple clothing/accessory recommendation.

Implemented:

- Static vanilla JavaScript PWA project.
- Mobile-first homepage.
- GPS location permission.
- Open-Meteo weather fetch using latitude/longitude.
- Weather normalization for current, daily, and hourly data.
- Basic recommendation module.
- Clear error states for denied location and failed weather fetch.

Changed from previous stage:

- This was the first working slice from an empty directory.

Learned:

- The core product value could be demonstrated without accounts, a backend, or notifications.
- Separating weather fetch logic from recommendation logic was important immediately.

### Stage 2: Checklist UI

Goal:

- Turn the recommendation from a single headline into a checklist-style homepage.

Implemented:

- Checklist title.
- Checkbox rows for recommended items.
- Completion state with a large check mark when every item is checked.
- Removed weather facts from the checklist box.

Changed from previous stage:

- The main screen became action-oriented instead of information-oriented.

Learned:

- The checklist format better matched the product goal: prepare before leaving.
- The UI should focus on what the user should do, not all the weather facts.

### Stage 3: Two-Screen UI

Goal:

- Keep the homepage focused on the checklist while still making weather details available.

Implemented:

- Checklist screen as default.
- Weather details screen.
- Weather details included large temperature, high/low, feels-like, rain, wind, conditions, and last updated.
- Navigation by buttons and later horizontal scroll/swipe.
- Centered/spacious weather screen while preserving the checklist-first homepage.

Changed from previous stage:

- Weather facts moved out of the main checklist card.
- The app became a two-screen mobile experience.

Learned:

- Product hierarchy matters: weather details are secondary.
- The app should feel like a utility, not a full weather dashboard.
- Swipe navigation improved the mobile feel, but visual changes to the checklist screen needed careful control.

### Stage 4: Expanded Recommendation Rules

Goal:

- Make the checklist more useful with a wider set of clothing/accessory items.

Implemented:

- Added items such as:
  - Umbrella
  - Light jacket
  - Heavy coat
  - Sweatshirt
  - Sweatpants
  - Scarf
  - Beanie
  - Gloves
  - Rain boots or waterproof shoes
  - Sunglasses or hat
  - Wind-resistant layer
  - Light clothing
- Better combinations for cold, rain, wind, snow, and heat.
- Conflict handling to avoid strange combinations like heavy coat plus light jacket.

Changed from previous stage:

- Recommendation logic became a real rules module rather than a tiny demo.

Learned:

- Clothing rules need to consider combinations, not single weather conditions.
- Decisive advice is more useful than vague advice.
- Sun-related recommendations need special handling because clear night skies are not a reason to bring sunglasses.

### Stage 5: Time-Period Logic Exploration

Goal:

- Explore time-aware recommendations based on parts of the day.

Implemented / attempted:

- Morning / Afternoon / Evening / Midnight periods.
- Later revised to Morning / Afternoon / Night.
- Custom routine start time that shifted period schedules.
- Forecast-window aggregation for selected periods.

Changed from previous stage:

- Checklist logic moved from current/daily weather toward hourly forecast windows.

Learned:

- Named periods created product confusion.
- If a user starts their day at 2:00 PM, calling that "Morning" is wrong.
- Even a revised Morning/Afternoon/Night model created edge cases.
- The product did not need named periods to answer the user problem.

### Stage 5 Revamp: Rolling Ready Checklist

Goal:

- Replace named periods with one rolling checklist based on the next 12 hours.

Implemented:

- Checklist title became `Ready Checklist:`.
- Removed Morning/Afternoon/Night checklist labels.
- Added `getNextForecastWindow()`.
- Added `buildWindowWeather()`.
- Checklist now uses the next 12 hours of hourly forecast data.
- Routine start time remains as a saved setting for notifications only.
- Sun protection logic now checks actual daylight-relevant hours in the 12-hour window.

Changed from previous stage:

- Product model became simpler and more truthful.
- Time labels no longer drive recommendation logic.

Learned:

- Rolling windows better match the core user question: "What do I need to be prepared for the next part of my day?"
- Product logic should not be over-labeled if a simpler time window solves the problem.
- Routine start time is a notification/scheduling concept, not a checklist naming concept.

### Stage 6A: Notification Readiness and Test Notifications

Goal:

- Prepare the PWA for notifications and add a test notification flow.

Implemented:

- Notification settings section.
- Notification support/permission state display.
- Permission request from a direct user action.
- Local test notification through the service worker registration.
- Service worker notification click handling to open/focus the app.
- Notification copy separated from browser delivery logic.

Changed from previous stage:

- The app could request permission and send a simple test notification.
- No backend scheduling yet.

Learned:

- On iPhone, Web Push requires Home Screen installation and HTTPS.
- Permission must be requested from a direct user action.
- Keep notification message/timing logic separate from the delivery method so it can be reused later.

### Stage 6B: Real Scheduled PWA Push Notifications

Goal:

- Add backend foundation for real scheduled Web Push reminders.

Implemented:

- `package.json` with Express/Web Push dependencies.
- Express backend in `server/index.js`.
- VAPID environment variables:
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`
- `/api/push/public-key`.
- `/api/push/subscriptions`.
- `/api/push/test`.
- `/api/health`.
- In-memory subscription store.
- Scheduler that checks routine start time in the user's saved timezone.
- Service worker `push` event handler.
- README instructions for setup, VAPID keys, local testing, deployment notes, and iPhone limitations.

Changed from previous stage:

- Notifications moved from local test only to real Web Push delivery.
- The frontend can now save a push subscription to the backend.
- The backend can send immediate test pushes and scheduled reminders.

Learned:

- Real scheduled notifications require a backend because the browser cannot wake itself reliably at a future time.
- Local success is not the same as iPhone PWA success.
- The backend is useful but not production-ready until subscriptions survive server restarts.

### Stage 7A: Personal iPhone PWA Notification Testing

Goal:

- Test the current PWA push system on the product manager/director's own iPhone before any broader pilot.

Implemented:

- No new product features.
- Testing plan recommended temporary HTTPS tunnel for fastest personal testing.
- Cloudflare Tunnel was used/recommended for exposing local Express server over HTTPS.

Confirmed:

- PWA could be opened via HTTPS tunnel.
- PWA could be installed on iPhone Home Screen.
- Location permission worked on iPhone.
- Notification permission worked on iPhone.
- Backend push worked on iPhone.

Changed from previous stage:

- No code changes were needed for the reported successful tunnel test.

Learned:

- iPhone PWA testing must be done from the Home Screen app, not just Safari.
- HTTPS tunnel is good for personal validation.
- Tunnel testing is not pilot-ready because the laptop/tunnel must stay awake and the in-memory store disappears on restart.

## 5. Major Product Decisions

### PWA Instead of Native iOS App For Now

Decision:

- Build as a PWA first.

Why:

- Faster to prototype.
- Avoids App Store approval and native iOS complexity.
- Web Push on iOS Home Screen PWAs can support the notification behavior needed for the MVP.

Tradeoff:

- iPhone push requires HTTPS, Home Screen installation, and iOS support.
- Some native-like behavior is more fragile than an App Store app.

### Checklist Instead of Full Weather App

Decision:

- The primary surface is a checklist, not a weather dashboard.

Why:

- The PRD explicitly says weather apps already show information, but users need practical advice.
- The checklist reduces cognitive load by turning data into action.

Tradeoff:

- Users who want rich weather details need a secondary screen.

### Second Weather Screen Instead of Weather Clutter on Homepage

Decision:

- Keep weather facts off the checklist screen.

Why:

- The homepage should answer "what should I wear/bring?" quickly.
- Details are still available for trust and context.

Tradeoff:

- More UI/navigation complexity than a single screen.

### Rolling 12-Hour Ready Checklist Instead of Named Time Periods

Decision:

- Use one `Ready Checklist:` based on the next 12 hours.

Why:

- Morning/Afternoon/Night labels created confusing edge cases.
- The user problem is preparation for the upcoming window, not labeling the day.

Tradeoff:

- Less semantic framing, but much simpler and more reliable.

### Simple Notification Copy Instead of Full Checklist in Notification

Decision:

- Notification only says the checklist is ready.

Why:

- Keeps push payload simple.
- Avoids stale checklist contents.
- Encourages opening the app, where the latest weather can be fetched and interpreted.

Tradeoff:

- Notification is less informative by itself.

### Routine Start Time Stored for Notification Timing

Decision:

- Routine start time does not change checklist naming/logic.
- It only controls scheduled reminder timing.

Why:

- Routine time is a habit/reminder concept.
- Checklist logic should remain based on the next 12 hours from now.

Tradeoff:

- The setting may feel less useful until scheduled reminders are fully production-ready.

## 6. Bugs, Problems, and Fixes

### Service Worker / Browser Caching Made Changes Not Appear

What happened:

- UI and service worker updates sometimes did not appear immediately in the browser.

Why it happened:

- Service workers cache app shell files and can serve stale versions during development.

Fix / mitigation:

- Bumped service worker cache names when app shell changed.
- Used hard refresh / service worker unregister guidance during testing.

Rule to remember:

- Service workers can cache stale files during development. After UI/service worker changes, hard refresh, unregister, or bump cache names.

### npm / package.json Confusion Early On

What happened:

- The project initially had a minimal `package-lock.json` but no real `package.json`.

Why it happened:

- The app started as static frontend files, then later needed Node dependencies for the backend.

Fix / mitigation:

- Added `package.json`, installed dependencies, and updated `package-lock.json`.

Rule to remember:

- Once backend dependencies are introduced, create and maintain a clear `package.json` and lockfile.

### Safari / iPhone Notification Permissions

What happened:

- iPhone notification testing needed more than local browser success.

Why it happened:

- iOS Web Push works for Home Screen web apps on HTTPS and requires permission from a direct user action.

Fix / mitigation:

- Added iPhone/PWA notes.
- Tested through HTTPS tunnel and Home Screen installation.

Rule to remember:

- For PWA notifications on iPhone, test from the Home Screen app over HTTPS. Safari tab testing is not enough.

### Midnight / Night Checklist Recommended Sunglasses or Hat

What happened:

- Earlier period-based logic could recommend `Sunglasses or hat` for a Midnight/Night checklist if skies were clear and warm.

Why it happened:

- Sun logic used weather condition codes without enough awareness of actual daylight hours.

Fix / mitigation:

- First made sun recommendations period-aware.
- Later replaced named periods and made sun logic depend on daylight-relevant hours inside the next 12-hour forecast window.

Rule to remember:

- Recommendations tied to daylight must check daylight hours, not just "clear" weather codes.

### Period-Based Checklist Labels Created Weird Edge Cases

What happened:

- Custom routine start time could make 2:00 PM become "Morning" or create awkward Morning/Afternoon/Night schedules.

Why it happened:

- The model treated user routine time as a period anchor instead of focusing on the actual upcoming weather window.

Fix / mitigation:

- Removed named checklist periods.
- Replaced them with the rolling `Ready Checklist:` based on the next 12 hours.

Rule to remember:

- Avoid over-labeled product logic if a rolling window solves the user problem better.

### In-Memory Backend Storage Disappears After Server Restart

What happened:

- Push subscriptions are stored only in process memory.

Why it happened:

- This was intentionally built as a proof-of-concept backend.

Fix / mitigation:

- README and this post-mortem clearly mark this as not production-ready.
- Next recommended step is persistent storage.

Rule to remember:

- In-memory storage is acceptable for proof of concept only. Do not invite testers until subscriptions survive restarts.

### Local Testing vs Real iPhone HTTPS/Home Screen Requirements

What happened:

- Local backend push can work on desktop, but iPhone PWA push has stricter conditions.

Why it happened:

- iOS requires installed Home Screen PWA plus HTTPS for Web Push.

Fix / mitigation:

- Stage 7A used a temporary HTTPS tunnel and Home Screen install.

Rule to remember:

- Do not trust local success as pilot readiness. Test on the real target device in the real launch mode.

### Scheduler Timing Is Still Naive

What happened:

- The scheduler checks subscriptions on an interval and sends when the local minute exactly equals the saved routine start minute.

Why it happened:

- This was the simplest proof-of-concept scheduler.

Fix / mitigation:

- It works for basic testing, but production needs a more durable scheduler and probably a grace window.

Rule to remember:

- Time-based systems need durable scheduling, missed-run handling, and persistence before pilots.

## 7. Current Architecture

### Frontend / PWA

Files:

- `index.html`
- `styles.css`
- `src/app.js`
- `manifest.webmanifest`

Responsibilities:

- Render mobile-first app shell.
- Handle GPS request.
- Fetch weather.
- Render Ready Checklist and Weather details screens.
- Save routine start time in `localStorage`.
- Request notification permission.
- Subscribe to backend push reminders.

### Location

File:

- `src/location.js`

Responsibilities:

- Validate secure context.
- Request GPS via `navigator.geolocation`.
- Convert browser geolocation failures into clear app errors.

### Weather API

File:

- `src/weather.js`

Source:

- Open-Meteo API.

Fetched fields:

- Current temperature, feels-like, precipitation, rain, showers, snowfall, weather code, wind.
- Daily weather code, high, low, precipitation probability, max wind.
- Hourly temperature, feels-like, precipitation probability, precipitation, rain, showers, snowfall, weather code, wind.

Important:

- `forecast_days` is `2`, which supports next-12-hour windows that cross midnight.

### Recommendation Logic

File:

- `src/recommendation.js`

Responsibilities:

- Build next-12-hour forecast window.
- Aggregate weather facts over that window.
- Convert weather into checklist items.
- Avoid conflicting items.
- Limit checklist size.
- Only recommend sun protection when daylight-relevant hours justify it.

### Notification Helpers

Files:

- `src/notifications.js`
- `src/reminders.js`

Responsibilities:

- Detect browser notification support.
- Request notification permission.
- Send Stage 6A local test notification.
- Fetch VAPID public key.
- Subscribe with `pushManager`.
- POST push subscription to backend.
- Keep reminder copy reusable and separate from browser delivery.

### Service Worker

File:

- `sw.js`

Responsibilities:

- Cache app shell.
- Serve cached GET requests when available.
- Handle local/test notification clicks.
- Handle real `push` events.
- Open or focus app on notification click.

Current cache:

- `morning-wear-v3`

### Express Backend

Files:

- `server/index.js`
- `server/pushService.js`
- `server/scheduler.js`
- `server/subscriptionStore.js`
- `server/time.js`

Responsibilities:

- Serve the PWA.
- Provide `/api/health`.
- Provide `/api/push/public-key`.
- Receive and store push subscriptions.
- Send backend test pushes.
- Run scheduled reminder checks.
- Store subscription metadata in memory.

### Web Push / VAPID

Dependency:

- `web-push`

Environment variables:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

Reminder payload:

- Title: `Ready Checklist`
- Body: `Your weather checklist is ready.`

### Scheduler

File:

- `server/scheduler.js`

Behavior:

- Runs every `SCHEDULER_INTERVAL_MS`.
- For each subscription:
  - Converts server time into the user's saved timezone.
  - Compares local minute-of-day to routine start time.
  - Sends one reminder per local date.

### In-Memory Subscription Store

File:

- `server/subscriptionStore.js`

Stores:

- Push subscription
- Routine start minutes
- Timezone
- Optional location
- Created/updated timestamps
- Last sent local date

Important:

- This data disappears when the server restarts.

## 8. Current Limitations

The app is not production-ready yet.

Known limitations:

- Push subscriptions are stored in memory and disappear after server restart.
- Laptop/tunnel testing is temporary.
- Cloudflare/ngrok tunnel URLs may change.
- Free hosting may sleep, which can break scheduled reminders.
- No database yet.
- No account/user identity model yet.
- No real privacy policy or consent language yet.
- Location is optionally saved by the backend, but privacy handling is not pilot-ready.
- No pilot feedback form or feedback pipeline yet.
- Clothing recommendations need real-user validation.
- iPhone testing requires HTTPS and Home Screen PWA installation.
- Scheduler is simple and may miss reminders if the server is asleep or down at the exact minute.
- No automated test suite beyond syntax checks and manual behavior checks.
- No unsubscribe UI yet.
- No subscription cleanup dashboard beyond backend logic for expired push endpoints.
- Notifications do not include checklist items yet by design.
- Weather rules are generic and not personalized.

What works locally:

- Express server serves frontend and backend.
- Open-Meteo weather fetch works.
- Ready Checklist generation works.
- Weather details screen works.
- Local test notifications work where supported.
- Backend push test endpoint works with stored subscriptions.
- Scheduler works while server is running and subscription store is populated.

What worked on personal iPhone via tunnel:

- HTTPS tunnel access.
- Home Screen PWA installation.
- Location permission.
- Notification permission.
- Backend push delivery to iPhone.

What still needs deployment/persistent storage:

- Stable HTTPS URL.
- Persistent push subscription database.
- Scheduled reminders surviving deploy/restart/server sleep.
- Tester-ready privacy/consent copy.
- Pilot feedback loop.

## 9. Pilot Readiness Checklist

Before inviting 5-10 testers:

- Deploy over stable HTTPS.
- Add persistent storage for push subscriptions and routine settings.
- Confirm scheduled notifications survive server restart.
- Confirm scheduled notifications survive deploy.
- Add unsubscribe/disable reminder path.
- Add basic consent/privacy copy.
- Decide exactly what location data is stored and why.
- Write tester instructions for iPhone Home Screen install.
- Create a feedback form.
- Test with one external user first.
- Define stop/go criteria for expanding from 1 tester to 5-10 testers.
- Confirm notification delivery across at least two different iPhones if possible.
- Confirm behavior when notification permission is denied.
- Confirm behavior when location permission is denied.
- Confirm behavior when backend is unavailable.
- Confirm that old service worker versions do not confuse testers.

Suggested stop/go criteria:

- Go to 5-10 testers only if:
  - One external tester can install the PWA without hand-holding.
  - Notification permission can be granted from the Home Screen app.
  - A scheduled notification arrives at the expected time after a server restart.
  - The user understands the checklist within 5 seconds.
  - The app has a clear privacy/consent explanation.

## 10. Recommended Next Steps

1. Add persistent storage.

   Recommended scope:

   - Start with a simple hosted database or SQLite for local proof of concept.
   - Store subscription endpoint/key payload, routine start time, timezone, optional location, and last sent date.
   - Preserve the current in-memory API shape as much as possible.

2. Deploy to stable HTTPS.

   Recommended target:

   - Render or a similar beginner-friendly Node host.
   - Ensure `HOST=0.0.0.0` in deployment.
   - Add VAPID environment variables.
   - Confirm service worker and push APIs work from the deployed URL.

3. Add consent/privacy copy.

   Required before testers:

   - Explain location use.
   - Explain push subscription storage.
   - Explain routine start time storage.
   - Explain that the app is experimental.

4. Write tester instructions.

   Include:

   - Open deployed URL in Safari.
   - Add to Home Screen.
   - Open from Home Screen.
   - Tap Settings.
   - Enable reminders.
   - Allow notifications.
   - Use current location.
   - What feedback to send.

5. Run one-person external test before 5-10 person pilot.

   Goal:

   - Validate installation, permission flow, scheduled reminder, and checklist comprehension with someone not involved in the build.

## 11. rules.md Additions

Copy these into `rules.md` or an equivalent project rules file:

```md
# Morning Wear Development Rules

- Always test one layer at a time: weather fetch, recommendation logic, UI, service worker, browser notification, backend push, scheduler, deployment.
- Keep product logic separate from delivery method. Recommendation rules should not depend on whether delivery is UI, local notification, backend push, or future native app.
- Do not add new features before validating the previous stage on the target device.
- Service workers can cache stale files during development. After app shell or service worker changes, hard refresh, unregister the service worker, or bump the cache version.
- For PWA notifications on iPhone, test from the Home Screen app over HTTPS. Safari-tab success is not enough.
- Do not trust local success as pilot readiness. Confirm behavior on the real target device and deployment mode.
- Keep notifications simple until the habit is validated. A notification can say the checklist is ready; the app can generate the detailed checklist.
- Avoid over-labeled product logic if rolling windows solve the user problem better.
- Routine start time is a notification scheduling setting, not checklist naming logic.
- Save working states with Git before major changes or conceptual refactors.
- After every bug fix, record the cause, fix, and prevention rule.
- Keep the checklist screen focused on action items. Weather facts belong on the Weather details screen.
- Store the least personal data possible. Treat location and push subscriptions as sensitive.
- In-memory storage is only for proof of concept. Do not invite testers until critical data survives restarts.
- If a feature touches iPhone PWA behavior, verify Home Screen install, HTTPS, service worker state, and notification permission.
- Prefer small, reversible implementation stages over broad rewrites.
```

## 12. Open Questions

Product questions:

- What data should we persist for pilot users?
- How much location data should be stored, if any?
- Should location be stored as exact coordinates, rounded coordinates, or not stored at all?
- Should notifications eventually include checklist items?
- Should users be able to edit recommendation sensitivity, such as "I get cold easily"?
- How accurate are the clothing recommendations for real people in different climates?
- What feedback mechanism should the pilot use?
- What is the minimum success metric for the first 5-10 testers?
- Should the app support children/family checklists later?
- Should the app send updated reminders later in the day, or only routine-start reminders?

Technical questions:

- Which hosting platform should be used for the first pilot?
- Which persistent storage option is simplest and safest?
- Should push subscriptions be tied to an anonymous device ID?
- How should users unsubscribe or delete their stored data?
- Should scheduler logic include a grace window to avoid missed reminders?
- How should failed push sends be retried?
- How often should stale subscriptions be cleaned up?
- Should service worker cache behavior be adjusted for easier development?
- Should the frontend show backend reminder sync status more explicitly?
- How should local/tunnel testing be separated from deployed pilot configuration?

## 13. New Codex Chat Handoff

Paste this into a new Codex chat:

```md
We are continuing the Morning Wear / Impact Corps PWA.

Product goal:
Reduce morning decision stress by turning weather data into a simple Ready Checklist for what to wear or bring. The app is for busy people, originally framed around a parent/mom getting ready under time pressure. The product should reduce cognitive load, not become a full weather app.

Current product state:
- Vanilla JS mobile-first PWA.
- Checklist screen titled "Ready Checklist:".
- Weather details screen.
- Swipe/scroll navigation between Checklist and Weather.
- GPS location permission.
- Open-Meteo weather fetch.
- Checklist recommendations use the next 12 hours of hourly forecast data.
- Routine start time setting is stored locally and used for notification timing, not checklist naming.
- Notification permission flow exists.
- Local Stage 6A test notification works.
- Real Stage 6B Web Push backend exists.
- Service worker handles push events and notification clicks.
- Express backend serves frontend and push APIs.
- Backend stores subscriptions in memory.
- Backend scheduler sends "Ready Checklist / Your weather checklist is ready." at saved routine start time.

Current architecture:
- Frontend/PWA: `index.html`, `styles.css`, `src/app.js`, `manifest.webmanifest`.
- Weather: `src/weather.js`.
- Location: `src/location.js`.
- Recommendation rules: `src/recommendation.js`.
- Notification helpers: `src/notifications.js`, `src/reminders.js`.
- Service worker: `sw.js`.
- Backend: `server/index.js`, `server/pushService.js`, `server/scheduler.js`, `server/subscriptionStore.js`, `server/time.js`.
- Config: `src/config.js`, `.env.example`, `package.json`.

Confirmed tests:
- `npm install` works.
- `npm run check` passes.
- `git diff --check` passed at Stage 6B.
- Express server boots locally.
- `/api/health` works locally.
- VAPID key generation works.
- Local Ready Checklist works.
- Local test notifications work where supported.
- Scheduled backend push reminders work locally while the server is running.
- Stage 7A personal iPhone tunnel test succeeded: HTTPS tunnel, Home Screen PWA install, location permission, notification permission, and backend push on iPhone all worked.

Known limitations:
- Push subscriptions are stored in memory and disappear after server restart.
- No database yet.
- No accounts or device identity model yet.
- No unsubscribe/delete data UI yet.
- No privacy/consent copy ready for testers.
- Laptop/tunnel testing is temporary.
- Free hosting may sleep, which can break scheduled reminders.
- iPhone PWA push requires HTTPS and Home Screen installation.
- Scheduler is simple and may miss reminders if the server is asleep/down at the exact minute.
- Recommendation rules need real-user validation.

Immediate next task:
Add persistent storage for push subscriptions/routine settings so scheduled reminders survive server restart. Keep the current API shape if possible. Do not add accounts yet unless absolutely necessary.

Constraints / do-not-change list:
- Do not change Ready Checklist recommendation logic unless necessary.
- Do not change the weather API unless necessary.
- Do not change swipe layout or weather details screen.
- Do not change notification copy unless necessary.
- Do not add native iOS, Capacitor, APNs native app code, Firebase native SDKs, or App Store-specific code.
- Keep it a pure PWA.
- Keep product logic separate from notification delivery.
- Preserve Stage 6A local test notification flow.

How to work with me:
- Treat me as the product manager/director.
- Plan first before coding.
- Explain tradeoffs clearly.
- Do one stage at a time.
- Avoid overbuilding.
- Validate each layer before moving on.
- After bugs, explain cause, fix, and prevention.
```
