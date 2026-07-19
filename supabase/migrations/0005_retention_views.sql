-- Retention/DAU is deliberately computed from analytics_events rather than a
-- dedicated session table: precise client-side session-end detection isn't
-- reliable on mobile Safari, so "was this installation active on day X" is
-- derived from whether it produced any event that day.

create or replace view public.v_daily_active_installations as
select
  date_trunc('day', occurred_at)::date as activity_date,
  installation_id
from public.analytics_events
group by date_trunc('day', occurred_at)::date, installation_id;

-- get_retention(cohort_date, day_n) answers "of installations first seen on
-- cohort_date, how many were still active exactly day_n days later" — call
-- with day_n = 1/3/7/14/30 for D1/D3/D7/D14/D30 retention. Weekly/monthly
-- active user counts are simple window queries over
-- v_daily_active_installations (see supabase/ANALYTICS_QUERIES.md) and don't
-- need their own function.
create or replace function public.get_retention(cohort_date date, day_n integer)
returns table (cohort_size bigint, retained_count bigint)
language sql
stable
as $$
  with cohort as (
    select id
    from public.app_installations
    where first_seen_at::date = cohort_date
  ),
  retained as (
    select distinct ae.installation_id
    from public.analytics_events ae
    join cohort c on c.id = ae.installation_id
    where ae.occurred_at::date = cohort_date + day_n
  )
  select
    (select count(*) from cohort) as cohort_size,
    (select count(*) from retained) as retained_count;
$$;

-- ROLLBACK (documentation only — not executed automatically):
-- drop function if exists public.get_retention(date, integer);
-- drop view if exists public.v_daily_active_installations;
