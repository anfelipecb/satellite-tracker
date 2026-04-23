-- Per-user active location + focused satellite (sync Mission Control, Globe Lab, Tiles).

create table if not exists public.user_ui_state (
  user_id text primary key,
  active_location_id uuid references public.user_locations (id) on delete set null,
  active_norad_id int references public.satellites (norad_id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.user_ui_state enable row level security;

create policy user_ui_state_own on public.user_ui_state
  for all to authenticated
  using ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_ui_state'
  ) then
    alter publication supabase_realtime add table public.user_ui_state;
  end if;
end $$;
