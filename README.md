# Morning Wear

Morning Wear is a PWA that creates a Ready Checklist from the next 12 hours of weather.

## Stage 6B Push Reminders

This stage adds a minimal Web Push backend for real scheduled PWA reminders. It is still a proof of concept:

- Push subscriptions are stored in memory and disappear when the server restarts.
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
```

Do not commit `.env`.

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
6. The app saves the push subscription, routine start time, timezone, and optional session location if you already used current location.
7. To send a backend push immediately, run:

```sh
curl -X POST http://localhost:3000/api/push/test \
  -H "Content-Type: application/json" \
  -d "{}"
```

The `Send test` button in the app remains the Stage 6A local browser notification test.

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

Before production, replace the in-memory store with a database. You will also want:

- User/account or anonymous device ownership model
- Subscription expiration cleanup
- Durable scheduler or job queue
- HTTPS hosting
- Monitoring and retry handling
- Privacy review for storing location data
