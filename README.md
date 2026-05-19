# Morning Wear

Morning Wear is a PWA that creates a Ready Checklist from the next 12 hours of weather.

## Stage 7B Persistent Push Reminders

This stage uses Supabase/Postgres to persist Web Push subscriptions for scheduled PWA reminders.

- Push subscriptions survive server restarts.
- Supabase is used from the backend only.
- The Supabase service role key must never be exposed to frontend JavaScript.
- Exact location is not stored in Supabase for Stage 7B.
- There are no accounts or user records yet.
- The scheduler is a simple interval that checks saved subscriptions.
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
SCHEDULER_INTERVAL_MS=30000
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_backend_only_service_role_key
SUPABASE_PUSH_SUBSCRIPTIONS_TABLE=push_subscriptions
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
```

No public Row Level Security policies are needed for Stage 7B. The browser does not talk to this table directly; only the Express backend uses the service role key.

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

Stage 7B intentionally does not store latitude, longitude, or accuracy.

## Run Locally

```sh
npm run dev
```

Open:

```text
http://localhost:3000
```

The Express server serves both the PWA and the `/api/push/*` endpoints, so the service worker, push subscription, and API share the same origin during local testing.

## Testing Push

1. Open `http://localhost:3000`.
2. Open Settings.
3. Choose your routine start time.
4. Tap `Enable reminders`.
5. Grant notification permission.
6. The backend saves the push subscription, routine start time, timezone, and reminder send metadata in Supabase.
7. To send a backend push immediately, run:

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

The backend checks subscriptions every `SCHEDULER_INTERVAL_MS`.

For each subscription, it compares the current time in the user's saved IANA timezone with the saved routine start time. If the minute matches and the reminder has not already been sent for that local date, the backend sends:

- Title: `Ready Checklist`
- Body: `Your weather checklist is ready.`

The notification click opens or focuses the PWA.

## iPhone / Safari Notes

Real iPhone PWA push testing requires:

- HTTPS deployment
- PWA installed to the Home Screen
- Notification permission granted from a direct user action
- Backend reachable over HTTPS
- Valid VAPID keys configured on the backend

Localhost testing is useful on desktop browsers. iPhone testing usually needs an HTTPS tunnel or deployed HTTPS environment.

## Production Notes

Stage 7B adds persistent storage, but deployment is still a separate Stage 7C step.

Before production or a broader pilot, you will also want:

- User/account or anonymous device ownership model
- Subscription expiration cleanup
- Durable scheduler or job queue
- HTTPS hosting
- Monitoring and retry handling
- Privacy review and tester-facing consent copy
