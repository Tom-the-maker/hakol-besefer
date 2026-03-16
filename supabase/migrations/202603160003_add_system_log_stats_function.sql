create or replace function public.get_system_log_stats()
returns table (
  total_sessions bigint,
  total_cost numeric,
  total_calls bigint
)
language sql
security definer
set search_path = public
as $$
  select
    count(distinct session_id)::bigint as total_sessions,
    coalesce(sum(estimated_cost_usd), 0)::numeric as total_cost,
    count(*)::bigint as total_calls
  from public.system_logs
$$;

revoke all on function public.get_system_log_stats() from public, anon, authenticated;
grant execute on function public.get_system_log_stats() to postgres, service_role;

comment on function public.get_system_log_stats() is 'Aggregated system log totals for internal dashboards without row-level scans over the API.';
