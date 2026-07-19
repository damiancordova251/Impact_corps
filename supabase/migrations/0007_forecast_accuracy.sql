-- Forecast-accuracy data pipeline: predicted-vs-actual weather comparison,
-- driven by workers/forecast-tracker (a new Cloudflare Worker, deployed
-- separately — see workers/forecast-tracker/README.md).
--
-- This is a data-collection and evaluation pipeline ONLY. Nothing in this
-- schema is ever read by domain/recommendation.js or applied automatically —
-- model_change_proposals is an explicit propose -> review -> approve/reject
-- -> apply -> (optionally) roll back workflow with a human in the loop every
-- time, matching the requirement that no autonomous system silently changes
-- production recommendation logic.

create table if not exists public.forecast_predictions (
  id uuid primary key default gen_random_uuid(),
  -- location_bucket is a simple "{lat},{lng}" string at the same 1-decimal
  -- coarse precision as push_subscriptions.coarse_latitude/longitude, so
  -- predictions/actuals for the same region can be grouped/joined without
  -- floating point equality comparisons.
  location_bucket text not null,
  coarse_latitude numeric(4, 1) not null,
  coarse_longitude numeric(5, 1) not null,
  provider text not null default 'open-meteo',
  provider_metadata jsonb not null default '{}'::jsonb,
  forecast_created_at timestamptz not null default now(),
  target_time timestamptz not null,
  horizon_hours integer not null,
  predicted_temp numeric,
  predicted_feels_like numeric,
  predicted_precip_probability numeric,
  predicted_precip_amount numeric,
  predicted_condition_code integer,
  predicted_wind_speed numeric,
  predicted_humidity numeric,
  recommendation_snapshot jsonb,
  created_at timestamptz not null default now()
);

alter table public.forecast_predictions enable row level security;

create index if not exists forecast_predictions_bucket_idx
  on public.forecast_predictions (location_bucket, target_time);

create index if not exists forecast_predictions_target_time_idx
  on public.forecast_predictions (target_time)
  where target_time is not null;

create table if not exists public.forecast_actuals (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.forecast_predictions (id),
  observed_temp numeric,
  observed_feels_like numeric,
  observed_precip_probability numeric,
  observed_precip_amount numeric,
  observed_condition_code integer,
  observed_wind_speed numeric,
  observed_humidity numeric,
  temp_error numeric,
  feels_like_error numeric,
  precip_probability_error numeric,
  condition_match boolean,
  would_change_recommendation boolean not null default false,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.forecast_actuals enable row level security;

create index if not exists forecast_actuals_prediction_idx
  on public.forecast_actuals (prediction_id);

-- Proposed rule/threshold changes derived from accuracy metrics. status
-- transitions are entirely manual (via the Supabase dashboard/SQL editor,
-- or a future admin view) — nothing in the app writes 'applied'/'rolled_back'
-- automatically.
create table if not exists public.model_change_proposals (
  id uuid primary key default gen_random_uuid(),
  based_on_period_start timestamptz not null,
  based_on_period_end timestamptz not null,
  proposed_change jsonb not null,
  rationale text,
  metrics_snapshot jsonb,
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'rejected', 'applied', 'rolled_back')),
  reviewed_by text,
  reviewed_at timestamptz,
  applied_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.model_change_proposals enable row level security;

create index if not exists model_change_proposals_status_idx
  on public.model_change_proposals (status, created_at desc);

-- ROLLBACK (documentation only — not executed automatically):
-- drop table if exists public.model_change_proposals;
-- drop table if exists public.forecast_actuals;
-- drop table if exists public.forecast_predictions;
