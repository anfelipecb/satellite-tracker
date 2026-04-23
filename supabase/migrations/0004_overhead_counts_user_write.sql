-- Allow authenticated users to write N2YO samples for their own locations so the
-- web app can use overhead_counts as a read-through cache (and avoid hammering
-- the N2YO API rate limit from every browser tab). The worker keeps using the
-- service-role key, which bypasses RLS, for SGP4 and its own N2YO polling.

drop policy if exists overhead_counts_user_insert_n2yo on public.overhead_counts;
create policy overhead_counts_user_insert_n2yo on public.overhead_counts
  for insert to authenticated
  with check (
    source = 'n2yo'
    and exists (
      select 1 from public.user_locations ul
      where ul.id = overhead_counts.user_location_id
        and (auth.jwt() ->> 'sub') = ul.user_id
    )
  );

drop policy if exists overhead_counts_user_update_n2yo on public.overhead_counts;
create policy overhead_counts_user_update_n2yo on public.overhead_counts
  for update to authenticated
  using (
    source = 'n2yo'
    and exists (
      select 1 from public.user_locations ul
      where ul.id = overhead_counts.user_location_id
        and (auth.jwt() ->> 'sub') = ul.user_id
    )
  )
  with check (
    source = 'n2yo'
    and exists (
      select 1 from public.user_locations ul
      where ul.id = overhead_counts.user_location_id
        and (auth.jwt() ->> 'sub') = ul.user_id
    )
  );
