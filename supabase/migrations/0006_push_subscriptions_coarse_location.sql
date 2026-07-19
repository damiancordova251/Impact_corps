-- Additive columns on the existing push_subscriptions table (see README.md
-- for its original definition) so scheduled reminders can mention weather
-- context. Both are nullable: existing subscriptions are unaffected and the
-- scheduler falls back to the current generic message when either is null.
--
-- coarse_latitude/coarse_longitude are rounded to 1 decimal degree (~11km)
-- *client-side*, before the request is ever sent — see
-- src/services/notificationsApi.js. Exact coordinates are never persisted
-- here, matching the project's existing "no exact location server-side"
-- privacy stance; this is a deliberate, narrow exception to *that* rule,
-- not a change to it.

alter table public.push_subscriptions
  add column if not exists coarse_latitude numeric(4, 1),
  add column if not exists coarse_longitude numeric(5, 1),
  add column if not exists preferred_language text;

-- ROLLBACK (documentation only — not executed automatically):
-- alter table public.push_subscriptions
--   drop column if exists coarse_latitude,
--   drop column if exists coarse_longitude,
--   drop column if exists preferred_language;
