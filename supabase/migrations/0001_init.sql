-- Satellite Tracker — initial schema (Clerk user ids as text on user_* tables)

create extension if not exists "uuid-ossp";

-- Reference: NORAD catalog
create table public.satellites (
  norad_id int primary key,
  name text not null,
  intl_designator text,
  category text[] default '{}',
  launch_date date,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.tles (
  norad_id int not null references public.satellites (norad_id) on delete cascade,
  epoch timestamptz not null,
  line1 text not null,
  line2 text not null,
  source text not null default 'celestrak',
  fetched_at timestamptz not null default now(),
  primary key (norad_id, epoch)
);

create index tles_norad_epoch_desc on public.tles (norad_id, epoch desc);

-- User-owned (Clerk sub in user_id)
create table public.user_locations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  radius_km double precision not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index user_locations_user_id on public.user_locations (user_id);

create table public.user_tracked_satellites (
  user_id text not null,
  norad_id int not null references public.satellites (norad_id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, norad_id)
);

create table public.passes (
  id uuid primary key default gen_random_uuid(),
  norad_id int not null references public.satellites (norad_id) on delete cascade,
  user_location_id uuid not null references public.user_locations (id) on delete cascade,
  start_utc timestamptz not null,
  end_utc timestamptz not null,
  max_elevation_deg double precision,
  max_magnitude double precision,
  source text not null,
  unique (norad_id, user_location_id, start_utc, source)
);

create index passes_location_time on public.passes (user_location_id, start_utc desc);

create table public.overhead_counts (
  user_location_id uuid not null references public.user_locations (id) on delete cascade,
  ts_minute timestamptz not null,
  above_elevation_deg double precision not null default 10,
  source text not null default 'sgp4',
  count int not null,
  primary key (user_location_id, ts_minute, above_elevation_deg, source)
);

create table public.granules (
  id text primary key,
  mission text not null,
  acquired_at timestamptz not null,
  footprint jsonb not null,
  cloud_cover double precision,
  fetched_at timestamptz not null default now()
);

create index granules_mission_time on public.granules (mission, acquired_at desc);

create table public.granule_tiles (
  granule_id text not null references public.granules (id) on delete cascade,
  h3_index text not null,
  primary key (granule_id, h3_index)
);

create index granule_tiles_h3 on public.granule_tiles (h3_index);

create table public.launches (
  id text primary key,
  name text not null,
  net_utc timestamptz,
  status text,
  vehicle text,
  provider text,
  updated_at timestamptz not null default now()
);

create table public.space_weather (
  ts timestamptz primary key,
  kp double precision,
  ap int,
  solar_wind_speed double precision,
  bz_nt double precision
);

-- RLS
alter table public.user_locations enable row level security;
alter table public.user_tracked_satellites enable row level security;
alter table public.passes enable row level security;
alter table public.overhead_counts enable row level security;

create policy user_locations_own on public.user_locations
  for all using ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);

create policy user_tracked_own on public.user_tracked_satellites
  for all using ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);

create policy passes_read_own_locations on public.passes
  for select using (
    exists (
      select 1 from public.user_locations ul
      where ul.id = passes.user_location_id and (auth.jwt() ->> 'sub') = ul.user_id
    )
  );

create policy overhead_counts_read_own on public.overhead_counts
  for select using (
    exists (
      select 1 from public.user_locations ul
      where ul.id = overhead_counts.user_location_id and (auth.jwt() ->> 'sub') = ul.user_id
    )
  );

-- Reference tables: authenticated read
alter table public.satellites enable row level security;
alter table public.tles enable row level security;
alter table public.launches enable row level security;
alter table public.space_weather enable row level security;
alter table public.granules enable row level security;
alter table public.granule_tiles enable row level security;

create policy satellites_read_auth on public.satellites
  for select to authenticated using (true);

create policy tles_read_auth on public.tles
  for select to authenticated using (true);

create policy launches_read_auth on public.launches
  for select to authenticated using (true);

create policy space_weather_read_auth on public.space_weather
  for select to authenticated using (true);

create policy granules_read_auth on public.granules
  for select to authenticated using (true);

create policy granule_tiles_read_auth on public.granule_tiles
  for select to authenticated using (true);

-- Realtime (Supabase publication)
alter publication supabase_realtime add table public.tles;
alter publication supabase_realtime add table public.passes;
alter publication supabase_realtime add table public.overhead_counts;
alter publication supabase_realtime add table public.launches;
alter publication supabase_realtime add table public.space_weather;
alter publication supabase_realtime add table public.user_locations;
alter publication supabase_realtime add table public.user_tracked_satellites;
alter publication supabase_realtime add table public.granules;
alter publication supabase_realtime add table public.granule_tiles;
