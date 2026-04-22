'use client';

import dynamic from 'next/dynamic';
import { useUser } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabaseBrowser } from '@/lib/supabase/browser';
import {
  buildOrbitTrack,
  elevationDegForObserver,
  propagatePositionDeg,
  type TleRow,
} from '@/lib/sgp4';
import type { GlobePoint, LivePathPoint, ObserverPoint, OrbitTrack } from '@/components/GlobeScene';
import type {
  N2yoAboveResponse,
  N2yoPositionsResponse,
  N2yoVisualPassesResponse,
} from '@satellite-tracker/shared';

const GlobeScene = dynamic(() => import('@/components/GlobeScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[72vh] items-center justify-center rounded-[2rem] border border-white/10 bg-black/50 text-sm text-slate-400">
      Loading mission globe…
    </div>
  ),
});

type LaunchRow = {
  id: string;
  name: string;
  net_utc: string | null;
  status: string | null;
  provider: string | null;
};

type LocationRow = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  last_viewed_at: string | null;
};

type FavoriteSatellite = {
  norad_id: number;
  name: string;
};

type WorkerCounts = {
  sgp4: number | null;
  n2yo: number | null;
  lastUpdated: string | null;
};

function fmtCoord(value: number, positive: string, negative: string) {
  const abs = Math.abs(value).toFixed(2);
  return `${abs}° ${value >= 0 ? positive : negative}`;
}

function fmtDateTime(value: string | null) {
  if (!value) return 'TBD';
  return new Date(value).toLocaleString();
}

function relativeTime(value: string | null) {
  if (!value) return 'No worker sample yet';
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  if (diffMin < 1) return 'updated just now';
  if (diffMin === 1) return 'updated 1 minute ago';
  return `updated ${diffMin} minutes ago`;
}

function pickLatestTleRows(
  rows: { norad_id: number; line1: string; line2: string; epoch?: string }[] | null | undefined,
  limit: number
) {
  const seen = new Set<number>();
  const dedup: TleRow[] = [];
  for (const row of rows ?? []) {
    if (seen.has(row.norad_id)) continue;
    seen.add(row.norad_id);
    dedup.push({ norad_id: row.norad_id, line1: row.line1, line2: row.line2 });
    if (dedup.length >= limit) break;
  }
  return dedup;
}

export function DashboardClient() {
  const { user, isLoaded } = useUser();
  const supabase = useSupabaseBrowser();

  const [now, setNow] = useState(() => new Date());
  const [kp, setKp] = useState<number | null>(null);
  const [launches, setLaunches] = useState<LaunchRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [favorites, setFavorites] = useState<FavoriteSatellite[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<number | null>(null);
  const [workerCounts, setWorkerCounts] = useState<WorkerCounts>({
    sgp4: null,
    n2yo: null,
    lastUpdated: null,
  });
  const [liveAboveCount, setLiveAboveCount] = useState<number | null>(null);
  const [passSummary, setPassSummary] = useState<string | null>(null);
  const [livePath, setLivePath] = useState<LivePathPoint[] | null>(null);
  const [backgroundRows, setBackgroundRows] = useState<TleRow[]>([]);
  const [favoriteRows, setFavoriteRows] = useState<TleRow[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FavoriteSatellite[]>([]);
  const [locationName, setLocationName] = useState('Home');
  const [locationLat, setLocationLat] = useState('41.8781');
  const [locationLon, setLocationLon] = useState('-87.6298');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingPath, setLoadingPath] = useState(false);
  const [loadingAbove, setLoadingAbove] = useState(false);

  const selectedLocation = useMemo(
    () => locations.find((row) => row.id === selectedLocationId) ?? locations[0] ?? null,
    [locations, selectedLocationId]
  );
  const selectedSatellite = useMemo(
    () => favorites.find((row) => row.norad_id === selectedSatelliteId) ?? favorites[0] ?? null,
    [favorites, selectedSatelliteId]
  );

  const refreshOverview = useCallback(async () => {
    if (!user?.id) return;

    const [{ data: sw }, { data: launchRows }, { data: locationRows, error: locationError }, { data: favoriteIds }] =
      await Promise.all([
        supabase.from('space_weather').select('kp').order('ts', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('launches').select('id,name,net_utc,status,provider').order('net_utc', { ascending: true }).limit(6),
        supabase
          .from('user_locations')
          .select('id,name,lat,lon,last_viewed_at')
          .order('created_at', { ascending: false }),
        supabase.from('user_tracked_satellites').select('norad_id').eq('user_id', user.id).order('added_at', { ascending: true }),
      ]);

    setKp(sw?.kp ?? null);
    setLaunches((launchRows as LaunchRow[] | null) ?? []);

    if (locationError) {
      setStatusMessage(locationError.message);
      return;
    }

    const nextLocations = (locationRows as LocationRow[] | null) ?? [];
    setLocations(nextLocations);
    if (nextLocations.length && !nextLocations.some((row) => row.id === selectedLocationId)) {
      setSelectedLocationId(nextLocations[0].id);
    }

    const ids = (favoriteIds ?? []).map((row) => row.norad_id);
    if (!ids.length) {
      setFavorites([]);
      setSelectedSatelliteId(null);
      return;
    }

    const { data: favoriteSatRows } = await supabase
      .from('satellites')
      .select('norad_id,name')
      .in('norad_id', ids);

    const nextFavorites = ids
      .map((noradId) => favoriteSatRows?.find((row) => row.norad_id === noradId))
      .filter((row): row is { norad_id: number; name: string } => Boolean(row))
      .map((row) => ({ norad_id: row.norad_id, name: row.name }));

    setFavorites(nextFavorites);
    if (nextFavorites.length && !nextFavorites.some((row) => row.norad_id === selectedSatelliteId)) {
      setSelectedSatelliteId(nextFavorites[0].norad_id);
    }
  }, [selectedLocationId, selectedSatelliteId, supabase, user?.id]);

  const refreshTleRows = useCallback(async () => {
    const favoriteIds = favorites.map((row) => row.norad_id);

    const [backgroundRes, favoriteRes] = await Promise.all([
      supabase
        .from('tles')
        .select('norad_id,line1,line2,epoch')
        .order('epoch', { ascending: false })
        .limit(3500),
      favoriteIds.length
        ? supabase
            .from('tles')
            .select('norad_id,line1,line2,epoch')
            .in('norad_id', favoriteIds)
            .order('epoch', { ascending: false })
            .limit(Math.max(favoriteIds.length * 12, 60))
        : Promise.resolve({ data: [], error: null }),
    ]);

    setBackgroundRows(pickLatestTleRows(backgroundRes.data, 280));
    setFavoriteRows(pickLatestTleRows(favoriteRes.data, 24));
  }, [favorites, supabase]);

  const refreshWorkerCounts = useCallback(async () => {
    if (!selectedLocation) {
      setWorkerCounts({ sgp4: null, n2yo: null, lastUpdated: null });
      setLiveAboveCount(null);
      return;
    }

    const { data } = await supabase
      .from('overhead_counts')
      .select('count,source,ts_minute')
      .eq('user_location_id', selectedLocation.id)
      .order('ts_minute', { ascending: false })
      .limit(20);

    const latestSgp4 = data?.find((row) => row.source === 'sgp4');
    const latestN2yo = data?.find((row) => row.source === 'n2yo');

    setWorkerCounts({
      sgp4: latestSgp4?.count ?? null,
      n2yo: latestN2yo?.count ?? null,
      lastUpdated: latestSgp4?.ts_minute ?? latestN2yo?.ts_minute ?? null,
    });
  }, [selectedLocation, supabase]);

  const refreshAboveSnapshot = useCallback(async () => {
    if (!selectedLocation) return;
    setLoadingAbove(true);
    try {
      const res = await fetch(
        `/api/n2yo/above?lat=${selectedLocation.lat}&lng=${selectedLocation.lon}&alt=0&radius=45&category=0`
      );
      if (!res.ok) throw new Error('Unable to fetch live above snapshot');
      const body = (await res.json()) as N2yoAboveResponse;
      setLiveAboveCount(body.above?.length ?? body.info.satcount ?? null);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to fetch live above snapshot');
    } finally {
      setLoadingAbove(false);
    }
  }, [selectedLocation]);

  const refreshLiveTrack = useCallback(async () => {
    if (!selectedLocation || !selectedSatellite) {
      setLivePath(null);
      setPassSummary(null);
      return;
    }

    setLoadingPath(true);
    try {
      const [positionsRes, passesRes] = await Promise.all([
        fetch(
          `/api/n2yo/positions?id=${selectedSatellite.norad_id}&lat=${selectedLocation.lat}&lng=${selectedLocation.lon}&alt=0&seconds=300`
        ),
        fetch(
          `/api/n2yo/visualpasses?id=${selectedSatellite.norad_id}&lat=${selectedLocation.lat}&lng=${selectedLocation.lon}&alt=0&days=1&min_visibility=120`
        ),
      ]);

      if (positionsRes.ok) {
        const positions = (await positionsRes.json()) as N2yoPositionsResponse;
        setLivePath(
          positions.positions.map((point) => ({
            lat: point.satlatitude,
            lon: point.satlongitude,
            altKm: point.sataltitude,
          }))
        );
      }

      if (passesRes.ok) {
        const body = (await passesRes.json()) as N2yoVisualPassesResponse;
        const nextPass = body.passes[0];
        setPassSummary(
          nextPass
            ? `${body.info.satname}: ${body.passes.length} visible pass window(s); next starts ${fmtDateTime(
                new Date(nextPass.startUTC * 1000).toISOString()
              )}`
            : `${body.info.satname}: no visible pass in the next 24 hours`
        );
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to load live N2YO track');
    } finally {
      setLoadingPath(false);
    }
  }, [selectedLocation, selectedSatellite]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 3000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isLoaded || !user) return;
    void refreshOverview();
  }, [isLoaded, refreshOverview, user]);

  useEffect(() => {
    void refreshTleRows();
  }, [refreshTleRows]);

  useEffect(() => {
    void refreshWorkerCounts();
  }, [refreshWorkerCounts]);

  useEffect(() => {
    if (!selectedLocation) return;
    void refreshAboveSnapshot();
  }, [refreshAboveSnapshot, selectedLocation]);

  useEffect(() => {
    if (!selectedLocation || !selectedSatellite) return;
    void refreshLiveTrack();
  }, [refreshLiveTrack, selectedLocation, selectedSatellite]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('mission-control')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'space_weather' }, () => void refreshOverview())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'launches' }, () => void refreshOverview())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'overhead_counts' }, () => void refreshWorkerCounts())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshOverview, refreshWorkerCounts, supabase, user]);

  const backgroundPoints = useMemo<GlobePoint[]>(() => {
    const trackedIds = new Set(favoriteRows.map((row) => row.norad_id));
    return backgroundRows
      .filter((row) => !trackedIds.has(row.norad_id))
      .map((row) => {
        const point = propagatePositionDeg(row, now);
        return point ? { id: row.norad_id, ...point } : null;
      })
      .filter((row): row is GlobePoint => Boolean(row));
  }, [backgroundRows, favoriteRows, now]);

  const favoritePoints = useMemo<GlobePoint[]>(() => {
    return favoriteRows
      .map((row) => {
        const point = propagatePositionDeg(row, now);
        return point ? { id: row.norad_id, ...point } : null;
      })
      .filter((row): row is GlobePoint => Boolean(row));
  }, [favoriteRows, now]);

  const focusPoint = useMemo(() => {
    if (!selectedSatellite) return null;
    const row = favoriteRows.find((entry) => entry.norad_id === selectedSatellite.norad_id);
    return row ? propagatePositionDeg(row, now) : null;
  }, [favoriteRows, now, selectedSatellite]);

  const orbitTracks = useMemo<OrbitTrack[]>(() => {
    return favoriteRows.map((row) => {
      const favorite = favorites.find((entry) => entry.norad_id === row.norad_id);
      const isFocused = row.norad_id === selectedSatellite?.norad_id;
      return {
        id: favorite?.name ?? `NORAD ${row.norad_id}`,
        positions: buildOrbitTrack(row, now, isFocused ? 120 : 70, isFocused ? 90 : 150),
        color: isFocused ? '#fb7185' : '#22d3ee',
        width: isFocused ? 2.8 : 1.2,
      };
    });
  }, [favoriteRows, favorites, now, selectedSatellite?.norad_id]);

  const observerPoint = useMemo<ObserverPoint | null>(() => {
    if (!selectedLocation) return null;
    return {
      id: selectedLocation.id,
      label: selectedLocation.name,
      lat: selectedLocation.lat,
      lon: selectedLocation.lon,
    };
  }, [selectedLocation]);

  const favoriteTelemetry = useMemo(() => {
    if (!selectedLocation) return [];
    return favoriteRows
      .map((row) => {
        const meta = favorites.find((entry) => entry.norad_id === row.norad_id);
        const point = propagatePositionDeg(row, now);
        if (!point) return null;
        return {
          noradId: row.norad_id,
          name: meta?.name ?? `NORAD ${row.norad_id}`,
          ...point,
          elevationDeg: elevationDegForObserver(row, now, selectedLocation.lat, selectedLocation.lon),
        };
      })
      .filter(
        (
          row
        ): row is {
          noradId: number;
          name: string;
          lat: number;
          lon: number;
          altKm: number;
          elevationDeg: number | null;
        } => Boolean(row)
      );
  }, [favoriteRows, favorites, now, selectedLocation]);

  async function handleLocationSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.id) return;

    const { error } = await supabase.from('user_locations').insert({
      user_id: user.id,
      name: locationName,
      lat: Number(locationLat),
      lon: Number(locationLon),
      radius_km: 0,
      last_viewed_at: new Date().toISOString(),
    });

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setStatusMessage(null);
    setLocationName('Home');
    await refreshOverview();
  }

  async function handleLocationDelete(id: string) {
    const { error } = await supabase.from('user_locations').delete().eq('id', id);
    if (error) {
      setStatusMessage(error.message);
      return;
    }
    await refreshOverview();
  }

  async function handleLocationActivate(id: string) {
    const { error } = await supabase
      .from('user_locations')
      .update({ last_viewed_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setSelectedLocationId(id);
    await refreshOverview();
  }

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;

    setLoadingSearch(true);
    setStatusMessage(null);

    const { data, error } = await supabase
      .from('satellites')
      .select('norad_id,name')
      .ilike('name', `%${term}%`)
      .limit(16);

    if (error) setStatusMessage(error.message);
    else setSearchResults((data as FavoriteSatellite[] | null) ?? []);

    setLoadingSearch(false);
  }

  async function handleFavoriteAdd(noradId: number) {
    if (!user?.id) return;
    const { error } = await supabase
      .from('user_tracked_satellites')
      .upsert({ user_id: user.id, norad_id: noradId }, { onConflict: 'user_id,norad_id' });

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    await refreshOverview();
    await refreshTleRows();
    setSelectedSatelliteId(noradId);
  }

  async function handleFavoriteRemove(noradId: number) {
    if (!user?.id) return;

    const { error } = await supabase
      .from('user_tracked_satellites')
      .delete()
      .eq('user_id', user.id)
      .eq('norad_id', noradId);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    await refreshOverview();
    await refreshTleRows();
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,#11324d_0%,#08101c_44%,#030507_100%)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Mission Control</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                Real-time globe, live counters, and tracked orbit paths
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                The globe updates from TLE propagation every few seconds. Worker counts stream from Supabase
                Realtime, and the selected favorite overlays an N2YO live path when available.
              </p>
            </div>
            <div className="grid gap-2 text-right text-xs text-slate-300">
              <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1">
                Kp index: <strong className="text-white">{kp ?? '—'}</strong>
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Focus: <strong className="text-white">{selectedSatellite?.name ?? 'Pick a favorite'}</strong>
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Location: <strong className="text-white">{selectedLocation?.name ?? 'Save a location'}</strong>
              </span>
            </div>
          </div>
          <GlobeScene
            points={[...backgroundPoints, ...favoritePoints]}
            tracks={orbitTracks}
            livePath={livePath}
            focus={focusPoint}
            observer={observerPoint}
          />
        </div>

        <div className="grid gap-4">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Overhead Counter</p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Worker SGP4</p>
                <p className="mt-2 text-3xl font-semibold text-white">{workerCounts.sgp4 ?? '—'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Worker N2YO</p>
                <p className="mt-2 text-3xl font-semibold text-white">{workerCounts.n2yo ?? '—'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Live Above</p>
                <p className="mt-2 text-3xl font-semibold text-white">{liveAboveCount ?? '—'}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>{relativeTime(workerCounts.lastUpdated)}</span>
              <button
                type="button"
                onClick={() => void refreshAboveSnapshot()}
                disabled={!selectedLocation || loadingAbove}
                className="rounded-full border border-cyan-400/30 px-3 py-1 text-cyan-200 transition hover:border-cyan-300 disabled:opacity-50"
              >
                {loadingAbove ? 'Refreshing…' : 'Refresh live count'}
              </button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Tracked Satellite</p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {selectedSatellite?.name ?? 'Add a favorite to start tracking'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => void refreshLiveTrack()}
                disabled={!selectedLocation || !selectedSatellite || loadingPath}
                className="rounded-full bg-rose-400 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
              >
                {loadingPath ? 'Syncing…' : 'Refresh live path'}
              </button>
            </div>

            {focusPoint ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Current Position</p>
                  <p className="mt-2 text-sm text-white">
                    {fmtCoord(focusPoint.lat, 'N', 'S')} · {fmtCoord(focusPoint.lon, 'E', 'W')}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{focusPoint.altKm.toFixed(0)} km altitude</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Pass Intelligence</p>
                  <p className="mt-2 text-sm text-slate-200">{passSummary ?? 'Waiting for N2YO pass data.'}</p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">Select a tracked satellite to see its orbit and telemetry.</p>
            )}
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Upcoming Launches</p>
            <ul className="mt-4 space-y-3">
              {launches.map((launch) => (
                <li key={launch.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-sm font-medium text-white">{launch.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {fmtDateTime(launch.net_utc)} · {launch.status ?? 'Unknown status'}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.9fr]">
        <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Saved Locations</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Observer presets for the counter</h3>
            </div>
            <span className="text-xs text-slate-500">{locations.length} saved</span>
          </div>

          <form onSubmit={handleLocationSave} className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={locationName}
              onChange={(event) => setLocationName(event.target.value)}
              placeholder="Location name"
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
            />
            <div className="md:col-span-1" />
            <input
              value={locationLat}
              onChange={(event) => setLocationLat(event.target.value)}
              placeholder="Latitude"
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
            />
            <input
              value={locationLon}
              onChange={(event) => setLocationLon(event.target.value)}
              placeholder="Longitude"
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
            />
            <button
              type="submit"
              className="md:col-span-2 rounded-full bg-cyan-300 px-4 py-3 text-sm font-medium text-slate-950"
            >
              Save location
            </button>
          </form>

          <div className="mt-4 space-y-3">
            {locations.length ? (
              locations.map((location) => (
                <div
                  key={location.id}
                  className={`rounded-2xl border px-4 py-3 ${
                    location.id === selectedLocation?.id
                      ? 'border-cyan-300/50 bg-cyan-400/10'
                      : 'border-white/10 bg-black/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-white">{location.name}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {fmtCoord(location.lat, 'N', 'S')} · {fmtCoord(location.lon, 'E', 'W')}
                      </p>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => void handleLocationActivate(location.id)}
                        className="rounded-full border border-white/15 px-3 py-1 text-slate-200"
                      >
                        Activate
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLocationDelete(location.id)}
                        className="rounded-full border border-rose-400/30 px-3 py-1 text-rose-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-slate-400">
                Save a location first. The worker only computes overhead counts for saved locations.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Satellite Tracking</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Find satellites and add favorites</h3>

          <form onSubmit={handleSearch} className="mt-4 flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ISS, Starlink, Hubble…"
              className="flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
            />
            <button
              type="submit"
              disabled={loadingSearch}
              className="rounded-full bg-cyan-300 px-4 py-3 text-sm font-medium text-slate-950 disabled:opacity-50"
            >
              {loadingSearch ? 'Searching…' : 'Search'}
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {searchResults.map((result) => (
              <div key={result.norad_id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                <div>
                  <p className="text-sm text-white">{result.name}</p>
                  <p className="text-xs text-slate-500">NORAD {result.norad_id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleFavoriteAdd(result.norad_id)}
                  className="rounded-full border border-cyan-400/30 px-3 py-1 text-xs text-cyan-200"
                >
                  Track
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Favorites in Orbit</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Tracked satellites on the globe</h3>

          <div className="mt-4 space-y-3">
            {favoriteTelemetry.length ? (
              favoriteTelemetry.map((satellite) => {
                const isActive = satellite.noradId === selectedSatellite?.norad_id;
                return (
                  <div
                    key={satellite.noradId}
                    className={`block w-full rounded-2xl border px-4 py-3 text-left transition ${
                      isActive ? 'border-rose-400/50 bg-rose-400/10' : 'border-white/10 bg-black/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <button type="button" onClick={() => setSelectedSatelliteId(satellite.noradId)} className="text-left">
                        <p className="text-sm font-medium text-white">{satellite.name}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {fmtCoord(satellite.lat, 'N', 'S')} · {fmtCoord(satellite.lon, 'E', 'W')}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {satellite.altKm.toFixed(0)} km altitude · elevation{' '}
                          {satellite.elevationDeg === null ? '—' : `${satellite.elevationDeg.toFixed(1)}°`}
                        </p>
                      </button>
                      <div className="flex flex-col items-end gap-2">
                        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                          NORAD {satellite.noradId}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleFavoriteRemove(satellite.noradId);
                          }}
                          className="text-xs text-rose-300"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-slate-400">
                Add favorites to project their predicted orbit and current position on the globe.
              </p>
            )}
          </div>
        </div>
      </section>

      {statusMessage ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          {statusMessage}
        </div>
      ) : null}
    </div>
  );
}
