-- 7d+ windows can hit PostgREST / pooler statement limits; raise timeout only
-- inside this RPC. CTE (materialized) on granules keeps the join selective.

create or replace function public.granule_tile_counts(
  p_mission text,
  p_since timestamptz,
  p_limit int default 5000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config('statement_timeout', '120s', true);
  return (
    select coalesce(jsonb_agg(t), '[]'::jsonb)
    from (
      with g as materialized (
        select id
        from public.granules
        where mission = p_mission
          and acquired_at >= p_since
      )
      select gt.h3_index, count(*)::bigint as count
      from public.granule_tiles gt
      join g on g.id = gt.granule_id
      group by gt.h3_index
      order by count(*) desc
      limit greatest(1, least(p_limit, 20000))
    ) t
  );
end;
$$;

grant execute on function public.granule_tile_counts(text, timestamptz, int) to authenticated, anon, service_role;
