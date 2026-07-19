-- Analytics core: one dimension table (app_installations) plus the general
-- event stream (analytics_events) that src/services/analytics.js's
-- trackEvent() writes to via POST /api/analytics/events.
--
-- Additive only: does not touch push_subscriptions or pilot_events, which
-- keep working exactly as documented in the root README.md.
--
-- Like every existing table in this project, RLS is enabled with no
-- anon/authenticated policies: the browser never talks to Supabase directly,
-- only the backend (Express or Cloudflare Pages Functions) using the
-- service-role key, which bypasses RLS by Supabase's own design.

create table if not exists public.app_installations (
  id text primary key,
  first_seen_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  preferred_language text,
  timezone text,
  platform text,
  browser text,
  os text,
  device_type text,
  pwa_installed boolean not null default false,
  notification_permission text,
  reminders_enabled boolean not null default false,
  referral_code text,
  app_version text,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_installations enable row level security;

create index if not exists app_installations_last_active_at_idx
  on public.app_installations (last_active_at);

create index if not exists app_installations_referral_code_idx
  on public.app_installations (referral_code)
  where referral_code is not null;

-- The general event stream. event_name is intentionally free text rather
-- than a CHECK-constrained enum (unlike pilot_events' original narrow list):
-- the application layer (src/services/analytics.js's ALLOWED_EVENT_NAMES,
-- mirrored in the backend) is the source of truth for which names are valid,
-- so adding a new event type never requires a migration.
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  installation_id text not null references public.app_installations (id),
  event_name text not null,
  category text,
  language text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

create index if not exists analytics_events_installation_occurred_idx
  on public.analytics_events (installation_id, occurred_at desc);

create index if not exists analytics_events_event_name_idx
  on public.analytics_events (event_name, occurred_at desc);

-- ROLLBACK (documentation only — not executed automatically):
-- drop table if exists public.analytics_events;
-- drop table if exists public.app_installations;
