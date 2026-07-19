-- Referral ownership + visit/conversion funnel. Kept relational (not just
-- analytics_events rows) because conversion queries need real joins: a visit
-- resulting in a new installation, and that installation's later retention.

create table if not exists public.referrals (
  code text primary key,
  owner_installation_id text not null references public.app_installations (id),
  created_at timestamptz not null default now()
);

alter table public.referrals enable row level security;

create index if not exists referrals_owner_idx
  on public.referrals (owner_installation_id);

create table if not exists public.referral_visits (
  id uuid primary key default gen_random_uuid(),
  referral_code text not null references public.referrals (code),
  share_channel text,
  visited_at timestamptz not null default now(),
  resulted_in_install boolean not null default false,
  new_installation_id text references public.app_installations (id),
  created_at timestamptz not null default now()
);

alter table public.referral_visits enable row level security;

create index if not exists referral_visits_code_idx
  on public.referral_visits (referral_code, visited_at desc);

-- ROLLBACK (documentation only — not executed automatically):
-- drop table if exists public.referral_visits;
-- drop table if exists public.referrals;
