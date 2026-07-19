-- Links a push subscription back to the same anonymous installation id used
-- everywhere else in analytics, so notification_events (which requires an
-- installation_id) can be recorded when a reminder is sent. Nullable and
-- additive: existing subscriptions (created before this column existed) keep
-- working, simply without a notification_events trail until they resubscribe.

alter table public.push_subscriptions
  add column if not exists installation_id text references public.app_installations (id);

create index if not exists push_subscriptions_installation_idx
  on public.push_subscriptions (installation_id);

-- ROLLBACK (documentation only — not executed automatically):
-- drop index if exists public.push_subscriptions_installation_idx;
-- alter table public.push_subscriptions drop column if exists installation_id;
