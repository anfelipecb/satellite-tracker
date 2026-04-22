'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabaseBrowser } from '@/lib/supabase/browser';
import type { GlobePoint, LivePathPoint } from '@/components/GlobeScene';
import { propagatePositionDeg, type TleRow } from '@/lib/sgp4';
import type { N2yoPositionsResponse } from '@satellite-tracker/shared';

const GlobeScene = dynamic(() => import('@/components/GlobeScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[72vh] items-center justify-center rounded-xl border border-white/10 bg-black/60 text-slate-400">
      Loading Cesium…
    </div>
  ),
});

export function GlobePageClient() {
  const supabase = useSupabaseBrowser();
  const [rows, setRows] = useState<TleRow[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<number>(25544);
  const [livePath, setLivePath] = useState<LivePathPoint[] | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase
        .from('tles')
        .select('norad_id,line1,line2,epoch')
        .order('epoch', { ascending: false })
        .limit(8000);
      if (e || !data) return;
      const seen = new Set<number>();
      const dedup: TleRow[] = [];
      for (const r of data) {
        if (seen.has(r.norad_id)) continue;
        seen.add(r.norad_id);
        dedup.push({ norad_id: r.norad_id, line1: r.line1, line2: r.line2 });
        if (dedup.length >= 450) break;
      }
      if (!cancelled) setRows(dedup);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 3000);
    return () => window.clearInterval(id);
  }, []);

  const points: GlobePoint[] = useMemo(() => {
    const out: GlobePoint[] = [];
    for (const r of rows) {
      const p = propagatePositionDeg(r, now);
      if (!p) continue;
      out.push({ id: r.norad_id, ...p });
    }
    return out;
  }, [rows, now]);

  const focusPoint = useMemo(() => {
    const row = rows.find((r) => r.norad_id === selectedId);
    if (!row) return null;
    return propagatePositionDeg(row, now);
  }, [rows, selectedId, now]);

  const loadLiveTrack = useCallback(async () => {
    setError(null);
    setLoadingLive(true);
    try {
      const loc = await supabase.from('user_locations').select('lat,lon').limit(1).maybeSingle();
      const lat = loc.data?.lat ?? 41.8781;
      const lng = loc.data?.lon ?? -87.6298;
      const res = await fetch(
        `/api/n2yo/positions?id=${selectedId}&lat=${lat}&lng=${lng}&alt=0&seconds=300`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
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
  }, [selectedId, supabase]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          NORAD ID (focus)
          <input
            type="number"
            value={selectedId}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            className="rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          />
        </label>
        <button
          type="button"
          onClick={loadLiveTrack}
          disabled={loadingLive}
          className="rounded-full bg-ember px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loadingLive ? 'Loading N2YO…' : 'Live track (N2YO, 300s)'}
        </button>
        <p className="max-w-xl text-xs text-slate-500">
          Globe positions refresh from TLEs via SGP4 every 3s. N2YO draws a 300-second forward path
          for the observer&apos;s first saved location (defaults to Chicago if none).
        </p>
      </div>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <GlobeScene points={points} livePath={livePath} focus={focusPoint} />
    </div>
  );
}
