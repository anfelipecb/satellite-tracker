'use client';

import dynamic from 'next/dynamic';
import { useUser } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSupabaseBrowser } from '@/lib/supabase/browser';
import { useActiveSelection } from '@/lib/hooks/useActiveSelection';
import type { GlobePoint, GlobeSceneHandle, LivePathPoint, OrbitTrack } from '@/components/GlobeScene';
import {
  buildOrbitTrack,
  buildOrbitTrackBackward,
  elevationDegForObserver,
  propagatePositionDeg,
  type TleRow,
} from '@/lib/sgp4';
import {
  DEFAULT_INTERESTING_NORAD,
  type GlobeCategoryFilter,
  satelliteMatchesCategory,
} from '@/lib/defaultSatellites';
import type { N2yoPositionsResponse } from '@satellite-tracker/shared';

const GlobeScene = dynamic(() => import('@/components/GlobeScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[72vh] items-center justify-center rounded-xl border border-white/10 bg-black/60 text-slate-400">
      Loading Cesium…
    </div>
  ),
});

const CATEGORIES: { id: GlobeCategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'iss', label: 'ISS' },
  { id: 'starlink', label: 'Starlink' },
  { id: 'hubble', label: 'Hubble / imaging' },
  { id: 'weather', label: 'Weather' },
  { id: 'spacex', label: 'SpaceX' },
];

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

export function GlobePageClient() {
  const { user, isLoaded } = useUser();
  const supabase = useSupabaseBrowser();
  const { activeLocationId, setActiveNoradId, activeNoradId, ready: selectionReady } = useActiveSelection(user?.id);

  const [rows, setRows] = useState<TleRow[]>([]);
  const [satMetas, setSatMetas] = useState<Record<number, { name: string; category: string[] }>>({});
  const [orbitTle, setOrbitTle] = useState<TleRow[]>([]);
  const [favorites, setFavorites] = useState<{ norad_id: number; name: string }[]>([]);
  const [observer, setObserver] = useState<{ name: string; lat: number; lon: number } | null>(null);
  const [aboveObserverOnly, setAboveObserverOnly] = useState(false);
  const [minElevationDeg, setMinElevationDeg] = useState<number>(0);
  const [now, setNow] = useState(() => new Date());
  const [category, setCategory] = useState<GlobeCategoryFilter>('all');
  const [globeMode, setGlobeMode] = useState<'live' | 'history'>('live');
  const [historyPhase, setHistoryPhase] = useState(0);
  const [livePath, setLivePath] = useState<LivePathPoint[] | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const globeRef = useRef<GlobeSceneHandle | null>(null);

  const simTime = useMemo(() => {
    if (globeMode === 'live') return now;
    return new Date(Date.now() - (1 - historyPhase) * 90 * 60 * 1000);
  }, [globeMode, now, historyPhase]);

  useEffect(() => {
    if (globeMode !== 'history') return;
    const id = window.setInterval(() => setHistoryPhase((p) => (p + 0.004) % 1), 200);
    return () => window.clearInterval(id);
  }, [globeMode]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 3000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isLoaded || !user) return;
    let cancelled = false;
    (async () => {
      const [{ data: fav }, { data: tleData, error: e1 }] = await Promise.all([
        supabase
          .from('user_tracked_satellites')
          .select('norad_id')
          .eq('user_id', user.id)
          .order('added_at', { ascending: true }),
        supabase
          .from('tles')
          .select('norad_id,line1,line2,epoch')
          .order('epoch', { ascending: false })
          .limit(8000),
      ]);
      if (e1 || !tleData) return;
      if (cancelled) return;
      const seen = new Set<number>();
      const dedup: TleRow[] = [];
      for (const r of tleData) {
        if (seen.has(r.norad_id)) continue;
        seen.add(r.norad_id);
        dedup.push({ norad_id: r.norad_id, line1: r.line1, line2: r.line2 });
        if (dedup.length >= 500) break;
      }
      setRows(dedup);

      const fIds = (fav ?? []).map((f) => f.norad_id);
      const union = Array.from(new Set([...fIds, ...DEFAULT_INTERESTING_NORAD]));
      const { data: oTle } = await supabase
        .from('tles')
        .select('norad_id,line1,line2,epoch')
        .in('norad_id', union)
        .order('epoch', { ascending: false })
        .limit(union.length * 20);
      if (cancelled) return;
      setOrbitTle(pickLatestTleRows(oTle, Math.max(union.length, 8)));

      if (fIds.length) {
        const { data: st } = await supabase.from('satellites').select('norad_id,name').in('norad_id', fIds);
        if (cancelled) return;
        const list = (st as { norad_id: number; name: string }[] | null) ?? [];
        setFavorites(
          fIds
            .map((id) => list.find((s) => s.norad_id === id))
            .filter((x): x is { norad_id: number; name: string } => Boolean(x))
        );
      } else {
        setFavorites([]);
      }

      const { data: metas } = await supabase
        .from('satellites')
        .select('norad_id,name,category')
        .in('norad_id', dedup.map((d) => d.norad_id));
      if (cancelled) return;
      const m: Record<number, { name: string; category: string[] }> = {};
      for (const s of (metas as { norad_id: number; name: string; category: string[] }[] | null) ?? []) {
        m[s.norad_id] = { name: s.name, category: s.category ?? [] };
      }
      setSatMetas(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, supabase, user]);

  // Pull observer lat/lon whenever the selected location changes, so the
  // "above my location" filter can run hemisphere tests against it.
  useEffect(() => {
    if (!user?.id) return;
    if (!activeLocationId) {
      setObserver(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_locations')
        .select('name,lat,lon')
        .eq('id', activeLocationId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) setObserver({ name: data.name, lat: data.lat, lon: data.lon });
      else setObserver(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeLocationId, supabase, user?.id]);

  const orbitIdSet = useMemo(() => new Set(orbitTle.map((t) => t.norad_id)), [orbitTle]);

  // Candidate rows after category filter. When "above my location" is on we
  // also remove anything below the horizon for the active observer. Expand
  // the candidate pool from 500 to the full loaded list when filtering, since
  // only a small fraction will remain visible.
  const aboveFilterActive = aboveObserverOnly && Boolean(observer);
  const filteredRows = useMemo(() => {
    const byCategory =
      category === 'all'
        ? rows
        : rows.filter((r) => {
            const m = satMetas[r.norad_id];
            return satelliteMatchesCategory(m?.name ?? '', m?.category, category);
          });
    if (!aboveFilterActive || !observer) return byCategory.slice(0, 220);
    const above: TleRow[] = [];
    for (const r of byCategory) {
      const el = elevationDegForObserver(r, simTime, observer.lat, observer.lon);
      if (el != null && el >= minElevationDeg) above.push(r);
      if (above.length >= 350) break;
    }
    return above;
  }, [rows, satMetas, category, aboveFilterActive, observer, simTime, minElevationDeg]);

  const points: GlobePoint[] = useMemo(() => {
    const byId = new Map<number, GlobePoint>();
    for (const r of filteredRows) {
      if (orbitIdSet.has(r.norad_id)) continue;
      const p = propagatePositionDeg(r, simTime);
      if (!p) continue;
      const m = satMetas[r.norad_id];
      byId.set(r.norad_id, { id: r.norad_id, name: m?.name, kind: 'background', ...p });
    }
    for (const r of orbitTle) {
      const p = propagatePositionDeg(r, simTime);
      if (!p) continue;
      const m = satMetas[r.norad_id];
      const fav = favorites.find((f) => f.norad_id === r.norad_id);
      const isFav = Boolean(fav);
      const isFocus = r.norad_id === activeNoradId;
      byId.set(r.norad_id, {
        id: r.norad_id,
        name: m?.name ?? fav?.name,
        kind: (isFocus ? 'focus' : isFav ? 'favorite' : 'background') as 'background' | 'favorite' | 'focus',
        ...p,
      });
    }
    return Array.from(byId.values());
  }, [activeNoradId, favorites, filteredRows, orbitIdSet, orbitTle, satMetas, simTime]);

  const orbitTracks: OrbitTrack[] = useMemo(() => {
    return orbitTle.map((row) => {
      const m = satMetas[row.norad_id];
      const name = m?.name ?? favorites.find((f) => f.norad_id === row.norad_id)?.name ?? `NORAD ${row.norad_id}`;
      const isF = row.norad_id === activeNoradId;
      const positions =
        globeMode === 'history'
          ? buildOrbitTrackBackward(row, simTime, 90, 90)
          : buildOrbitTrack(row, simTime, isF ? 120 : 80, isF ? 90 : 150);
      return {
        id: name,
        noradId: row.norad_id,
        positions,
        color: isF ? '#fb7185' : '#22d3ee',
        width: isF ? 2.5 : 1.2,
      };
    });
  }, [activeNoradId, favorites, globeMode, orbitTle, satMetas, simTime]);

  const loadLiveTrack = useCallback(async () => {
    if (!user?.id || !activeNoradId) {
      setError('Sign in and select a satellite (Mission Control or click the globe).');
      return;
    }
    setError(null);
    setLoadingLive(true);
    try {
      let loc = { lat: 41.8781, lng: -87.6298 as number };
      if (activeLocationId) {
        const { data: locRow } = await supabase
          .from('user_locations')
          .select('lat,lon')
          .eq('id', activeLocationId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (locRow) loc = { lat: locRow.lat, lng: locRow.lon };
      } else {
        const { data: anyLoc } = await supabase
          .from('user_locations')
          .select('lat,lon')
          .eq('user_id', user.id)
          .order('last_viewed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (anyLoc) loc = { lat: anyLoc.lat, lng: anyLoc.lon };
      }
      const res = await fetch(
        `/api/n2yo/positions?id=${activeNoradId}&lat=${loc.lat}&lng=${loc.lng}&alt=0&seconds=300`
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? res.statusText);
      }
      const json = (await res.json()) as N2yoPositionsResponse;
      const path: LivePathPoint[] = json.positions.map((p) => ({
        lat: p.satlatitude,
        lon: p.satlongitude,
        altKm: p.sataltitude,
      }));
      setLivePath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load N2YO track');
    } finally {
      setLoadingLive(false);
    }
  }, [activeLocationId, activeNoradId, supabase, user?.id]);

  const onPointClick = useCallback(
    (id: number) => {
      setActiveNoradId(id);
    },
    [setActiveNoradId]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                category === c.id
                  ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-100'
                  : 'border-white/10 text-slate-400 hover:border-white/20'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">View</span>
          <button
            type="button"
            onClick={() => setGlobeMode('live')}
            className={`rounded-full px-3 py-1.5 text-xs ${
              globeMode === 'live' ? 'bg-rose-500/30 text-white' : 'bg-white/5 text-slate-400'
            }`}
          >
            Live (SGP4)
          </button>
          <button
            type="button"
            onClick={() => setGlobeMode('history')}
            className={`rounded-full px-3 py-1.5 text-xs ${
              globeMode === 'history' ? 'bg-amber-500/30 text-amber-100' : 'bg-white/5 text-slate-400'
            }`}
          >
            History 90m
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            value={activeNoradId ?? 25544}
            onChange={(e) => setActiveNoradId(Number(e.target.value))}
            className="w-28 rounded border border-white/10 bg-black/40 px-2 py-2 text-xs text-white"
            title="NORAD (syncs with Mission Control)"
            disabled={!selectionReady}
          />
          <button
            type="button"
            onClick={() => void loadLiveTrack()}
            disabled={loadingLive || !user}
            className="rounded-full bg-ember px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loadingLive ? 'Loading N2YO…' : 'Live track (N2YO, 300s)'}
          </button>
          <button
            type="button"
            onClick={() => activeNoradId && globeRef.current?.focusOnSatellite(activeNoradId)}
            disabled={!activeNoradId}
            className="rounded-full border border-rose-400/40 bg-rose-500/20 px-3 py-2 text-xs text-rose-100 disabled:opacity-50"
          >
            Focus camera
          </button>
          <button
            type="button"
            onClick={() => globeRef.current?.resetView()}
            className="rounded-full border border-white/15 px-3 py-2 text-xs text-slate-200"
          >
            Reset view
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAboveObserverOnly((v) => !v)}
            disabled={!observer}
            title={
              observer
                ? `Show only satellites above ${observer.name}'s horizon right now`
                : 'Save or activate an observer location to enable this filter'
            }
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              aboveObserverOnly
                ? 'border-emerald-400/50 bg-emerald-500/25 text-emerald-100'
                : 'border-white/10 text-slate-300 hover:border-white/20'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {aboveObserverOnly ? 'Showing above observer' : 'Only above my location'}
          </button>
          {aboveObserverOnly ? (
            <label className="flex items-center gap-2 text-xs text-slate-400">
              min elevation
              <input
                type="number"
                min={-10}
                max={85}
                step={5}
                value={minElevationDeg}
                onChange={(e) => setMinElevationDeg(Math.max(-10, Math.min(85, Number(e.target.value) || 0)))}
                className="w-16 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
              />
              <span className="text-slate-500">°</span>
            </label>
          ) : null}
          {observer ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300">
              Observer: <span className="text-slate-100">{observer.name}</span>
              <span className="ml-1 text-slate-500">
                ({observer.lat.toFixed(2)}°, {observer.lon.toFixed(2)}°)
              </span>
            </span>
          ) : (
            <span className="rounded-full border border-white/5 bg-white/5 px-2 py-1 text-[11px] text-slate-500">
              No active observer location
            </span>
          )}
        </div>
        <p className="max-w-xl text-xs text-slate-500">
          {globeMode === 'live' ? 'Positions refresh from TLEs every 3s.' : 'Replays the last 90 minutes along each track.'} Click a
          satellite to sync selection with Mission Control. N2YO path uses your active saved location.
        </p>
      </div>
      {aboveObserverOnly && observer ? (
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100">
          <strong className="font-semibold">{filteredRows.length}</strong> satellites from the background pool with
          elevation ≥ {minElevationDeg}° above <span className="text-emerald-50">{observer.name}</span> right now
          (SGP4, from the most recent {rows.length} TLEs we loaded — the Mission Control “Crossing your sky now”
          count uses N2YO’s full catalog).
        </div>
      ) : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <GlobeScene
        ref={globeRef}
        points={points}
        tracks={orbitTracks}
        livePath={globeMode === 'live' ? livePath : null}
        onPointClick={onPointClick}
        showLabels={false}
      />
    </div>
  );
}
