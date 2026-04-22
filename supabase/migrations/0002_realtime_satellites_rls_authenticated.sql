-- Worker upserts `satellites`; expose changes over Realtime (publication was missing in 0001).
-- Tighten RLS: scope user/data policies to the `authenticated` role (Clerk JWT must include role "authenticated").

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'satellites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.satellites;
  END IF;
END $$;

DROP POLICY IF EXISTS user_locations_own ON public.user_locations;
CREATE POLICY user_locations_own ON public.user_locations
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS user_tracked_own ON public.user_tracked_satellites;
CREATE POLICY user_tracked_own ON public.user_tracked_satellites
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS passes_read_own_locations ON public.passes;
CREATE POLICY passes_read_own_locations ON public.passes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_locations ul
      WHERE ul.id = passes.user_location_id AND (auth.jwt() ->> 'sub') = ul.user_id
    )
  );

DROP POLICY IF EXISTS overhead_counts_read_own ON public.overhead_counts;
CREATE POLICY overhead_counts_read_own ON public.overhead_counts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_locations ul
      WHERE ul.id = overhead_counts.user_location_id AND (auth.jwt() ->> 'sub') = ul.user_id
    )
  );

DROP POLICY IF EXISTS satellites_read_auth ON public.satellites;
CREATE POLICY satellites_read_auth ON public.satellites
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS tles_read_auth ON public.tles;
CREATE POLICY tles_read_auth ON public.tles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS launches_read_auth ON public.launches;
CREATE POLICY launches_read_auth ON public.launches
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS space_weather_read_auth ON public.space_weather;
CREATE POLICY space_weather_read_auth ON public.space_weather
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS granules_read_auth ON public.granules;
CREATE POLICY granules_read_auth ON public.granules
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS granule_tiles_read_auth ON public.granule_tiles;
CREATE POLICY granule_tiles_read_auth ON public.granule_tiles
  FOR SELECT TO authenticated
  USING (true);
