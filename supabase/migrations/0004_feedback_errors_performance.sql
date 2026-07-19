-- Feedback content (the prompt's shown/postponed/dismissed lifecycle already
-- flows through analytics_events via trackEvent(); this table is only the
-- actual rating + written feedback), plus small structured tables for
-- client-side errors and API performance.

create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  installation_id text not null references public.app_installations (id),
  rating integer check (rating is null or (rating >= 1 and rating <= 5)),
  comment text,
  -- Free-text answer to "what other clothing options would you like to see
  -- in the app?" — an optional, separate question from the general comment
  -- box, surfaced to the user as its own field for easier manual review.
  clothing_suggestions text,
  category text,
  app_version text,
  language text,
  from_scheduled_prompt boolean not null default false,
  -- No accounts/contact details exist in this app yet, so this stays
  -- unusable until/unless one does — see server/README notes on privacy.
  allow_follow_up boolean not null default false,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.feedback_submissions enable row level security;

create index if not exists feedback_submissions_installation_idx
  on public.feedback_submissions (installation_id, submitted_at desc);

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  installation_id text references public.app_installations (id),
  error_type text not null,
  message text,
  stack_excerpt text,
  app_version text,
  platform text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.client_errors enable row level security;

create index if not exists client_errors_occurred_idx
  on public.client_errors (occurred_at desc);

create table if not exists public.api_performance_events (
  id uuid primary key default gen_random_uuid(),
  installation_id text references public.app_installations (id),
  endpoint text not null,
  duration_ms integer,
  status_code integer,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.api_performance_events enable row level security;

create index if not exists api_performance_events_endpoint_idx
  on public.api_performance_events (endpoint, occurred_at desc);

-- ROLLBACK (documentation only — not executed automatically):
-- drop table if exists public.api_performance_events;
-- drop table if exists public.client_errors;
-- drop table if exists public.feedback_submissions;
