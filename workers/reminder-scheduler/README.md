# Ready Reminder Scheduler Worker

This Cloudflare Worker runs the scheduled Ready Checklist reminder job with a Cron Trigger. Render still serves the PWA and Express API; this Worker only handles scheduled reminder delivery.

## Cost Notes

This is designed for Cloudflare Workers Free, Supabase Free, and Render Free for a small 5-10 person pilot.

- The default cron schedule is every 5 minutes, about 288 Worker invocations per day.
- Workers Free has request, CPU, subrequest, and cron trigger limits. A small pilot should fit, but this is not production-scale scheduling.
- Do not enable Workers Paid, paid Cloudflare storage, paid Render, or paid Supabase unless explicitly approved.

## Web Push Library

The Worker uses `@block65/webcrypto-web-push` because it builds Web Push requests with Web Crypto APIs that are compatible with Cloudflare Workers. The existing Express backend uses the Node `web-push` package, but that package is not the safest fit for Workers.

## Required Secrets And Vars

Set these in Cloudflare Worker settings or with `wrangler secret put`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

The service role key must stay backend-only. Never commit `.dev.vars`, `.env`, or copied secrets.

These non-secret vars are included in `wrangler.toml`:

- `SUPABASE_PUSH_SUBSCRIPTIONS_TABLE=push_subscriptions`
- `CRON_WINDOW_MINUTES=5`
- `DRY_RUN=true`

Keep `DRY_RUN=true` until the Worker can read Supabase and identify due reminders correctly. Set `DRY_RUN=false` only when ready for real sends.

## Local Setup

```sh
cd workers/reminder-scheduler
npm install
cp .dev.vars.example .dev.vars
```

Fill `.dev.vars` with the same Supabase and VAPID values used by the backend.

## Local Dry Run

```sh
npm run dev
```

In another terminal:

```sh
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*"
```

With `DRY_RUN=true`, the Worker should log due reminders but should not send pushes or update `last_sent_date`.

## Local Real Send Test

1. Confirm your iPhone PWA already has a row in `push_subscriptions`.
2. Set that row's `routine_start_minutes` to the next 5-minute local window.
3. Set `last_sent_date` to `null` or an earlier local date.
4. Set `DRY_RUN=false` in `.dev.vars`.
5. Run the scheduled curl again.
6. Confirm the iPhone receives `Ready Checklist`.
7. Confirm `last_sent_date` updates in Supabase.
8. Run the scheduled curl again and confirm no duplicate sends for the same local date.

## Deployment

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

Cloudflare Cron Trigger changes can take several minutes to propagate.

## Render Scheduler Handoff

Before setting `DRY_RUN=false` in the deployed Worker, configure Render with:

```txt
ENABLE_EXPRESS_SCHEDULER=false
```

This keeps the PWA and API online but stops Render's scheduled reminder loop so the Worker is the only scheduled sender.

## Rollback

1. Set deployed Worker `DRY_RUN=true` or remove the Cron Trigger.
2. Set Render `ENABLE_EXPRESS_SCHEDULER=true` or remove the variable.
3. Redeploy/restart Render.
4. Confirm Render logs show `Reminder scheduler running`.
