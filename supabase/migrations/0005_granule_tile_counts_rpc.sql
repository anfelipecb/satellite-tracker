-- Server-side aggregation for the tiles page. Before this RPC the Next route
-- fanned out hundreds of granule IDs client-side and fetched tiles via
-- PostgREST .in() filters, which silently capped every batch at 1 000 rows
-- (the default PostgREST cap) and made the UI report a fake plateau of 5 000
-- observations regardless of mission / window.
--
-- Returning the aggregation as a single recordset lets the UI show the true
-- H3 coverage and observation totals for 24h / 7d / 30d windows.

-- `p_limit` caps the number of cells returned: a 7-day MOD09GA window can
-- hit ~211k unique H3 res-4 cells (≈ half of Earth's landmass), which would
-- ship > 20 MB of JSON and choke the browser. 5 000 top cells give more
-- than enough detail for the schematic dashboard while staying responsive.
--
-- Returns a single jsonb blob (array) rather than a setof so PostgREST's
-- default 1 000-row response cap does not silently truncate the aggregation.
create or replace function public.granule_tile_counts(
  p_mission text,
  p_since timestamptz,
  p_limit int default 5000
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb)
  from (
    select gt.h3_index, count(*)::bigint as count
    from public.granule_tiles gt
    join public.granules g on g.id = gt.granule_id
    where g.mission = p_mission
      and g.acquired_at >= p_since
    group by gt.h3_index
    order by count(*) desc
    limit greatest(1, least(p_limit, 20000))
  ) t;
$$;

grant execute on function public.granule_tile_counts(text, timestamptz, int) to authenticated, anon, service_role;
