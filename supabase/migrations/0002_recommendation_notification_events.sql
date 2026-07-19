-- Structured lifecycle tables for recommendations and notifications. Kept
-- separate from analytics_events because both need typed columns (weather
-- conditions, generation timing, a multi-timestamp delivery lifecycle)
-- rather than an append-only event stream.

create table if not exists public.recommendation_events (
  id uuid primary key default gen_random_uuid(),
  installation_id text not null references public.app_installations (id),
  occurred_at timestamptz not null default now(),
  expected_time_away_hours integer,
  weather_conditions jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  personalized boolean not null default false,
  generation_time_ms integer,
  user_feedback_useful boolean,
  user_feedback_followed boolean,
  error text,
  created_at timestamptz not null default now()
);

alter table public.recommendation_events enable row level security;

create index if not exists recommendation_events_installation_idx
  on public.recommendation_events (installation_id, occurred_at desc);

-- One row per scheduled reminder, updated across its own lifecycle rather
-- than inserted fresh per state change (delivered_at/opened_at/dismissed_at
-- are only reliably knowable at different times, and are nullable until then).
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  installation_id text not null references public.app_installations (id),
  notification_type text not null default 'scheduled_reminder',
  message_variant text,
  weather_context jsonb,
  scheduled_at timestamptz not null default now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  dismissed_at timestamptz,
  led_to_session boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notification_events enable row level security;

create index if not exists notification_events_installation_idx
  on public.notification_events (installation_id, scheduled_at desc);

-- ROLLBACK (documentation only — not executed automatically):
-- drop table if exists public.notification_events;
-- drop table if exists public.recommendation_events;
