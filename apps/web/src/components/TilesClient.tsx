'use client';

import { useUser } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { latLngToCell } from 'h3-js';
import { useSupabaseBrowser } from '@/lib/supabase/browser';
import { propagatePositionDeg, type TleRow } from '@/lib/sgp4';
import { TilesMap } from '@/components/TilesMap';

const MISSIONS = [
  { value: 'MOD09GA', label: 'MODIS Terra (MOD09GA)' },
  { value: 'MYD09GA', label: 'MODIS Aqua (MYD09GA)' },
  { value: 'LANDSAT_OT_C2_L2', label: 'Landsat OLI-2' },
  { value: 'S2A_MSIL2A', label: 'Sentinel-2A (L2A)' },
] as const;

const H3_RES = 4;

export function TilesClient() {
  const { user, isLoaded } = useUser();
  const supabase = useSupabaseBrowser();
  const [mission, setMission] = useState<string>('MOD09GA');
  const [hours, setHours] = useState(24);
  const [cells, setCells] = useState<{ h3_index: string; count: number }[]>([]);
  const [predicted, setPredicted] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const maxCount = useMemo(() => cells.reduce((m, c) => Math.max(m, c.count), 0), [cells]);

  const loadAggregate = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tiles/aggregate?mission=${encodeURIComponent(mission)}&hours=${hours}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? res.statusText);
      }
      const j = (await res.json()) as { cells: { h3_index: string; count: number }[] };
      setCells(j.cells ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to load tiles');
    } finally {
      setLoading(false);
    }
  }, [hours, mission]);

  const loadPredicted = useCallback(async () => {
    if (!user?.id) {
      setPredicted([]);
      return;
    }
    const { data: tracked } = await supabase
      .from('user_tracked_satellites')
      .select('norad_id')
      .eq('user_id', user.id)
      .limit(24);
    const ids = (tracked as { norad_id: number }[] | null)?.map((t) => t.norad_id) ?? [];
    if (!ids.length) {
      setPredicted([]);
      return;
    }
    const { data: tles } = await supabase
      .from('tles')
      .select('norad_id,line1,line2,epoch')
      .in('norad_id', ids)
      .order('epoch', { ascending: false })
      .limit(ids.length * 8);
    const byNorad = new Map<number, TleRow>();
    for (const row of (tles as { norad_id: number; line1: string; line2: string }[] | null) ?? []) {
      if (!byNorad.has(row.norad_id)) {
        byNorad.set(row.norad_id, { norad_id: row.norad_id, line1: row.line1, line2: row.line2 });
      }
    }
    const setCellsH3 = new Set<string>();
    const start = Date.now();
    for (const id of ids) {
      const row = byNorad.get(id);
      if (!row) continue;
      for (let m = 0; m <= 90; m += 2) {
        const p = propagatePositionDeg(row, new Date(start + m * 60_000));
        if (!p) continue;
        try {
          setCellsH3.add(latLngToCell(p.lat, p.lon, H3_RES));
        } catch {
          /* skip */
        }
      }
    }
    setPredicted([...setCellsH3]);
  }, [supabase, user?.id]);

  useEffect(() => {
    if (!isLoaded || !user) return;
    void loadAggregate();
    void loadPredicted();
  }, [isLoaded, loadAggregate, loadPredicted, user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('tiles-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'granule_tiles' }, () => void loadAggregate())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'granules' }, () => void loadAggregate())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAggregate, supabase, user]);

  const top10 = useMemo(() => cells.slice(0, 10), [cells]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">
        NASA CMR granules (via the worker) are hashed to H3 (res 4) and stored in <code className="text-aurora">granule_tiles</code>.
        Cyan: where data has been seen recently. Rose: predicted ground footprint for your tracked satellites (client SGP4, next ~90m).
        Live updates on insert.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Mission
          <select
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          >
            {MISSIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Window (h)
          <input
            type="number"
            min={1}
            max={168}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value) || 24)}
            className="w-24 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadAggregate()}
          disabled={loading}
          className="rounded-full bg-cyan-400/90 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={() => void loadPredicted()}
          className="rounded-full border border-rose-400/40 px-4 py-2 text-sm text-rose-100"
        >
          Refresh pass prediction
        </button>
      </div>

      {msg ? <p className="text-sm text-amber-200">{msg}</p> : null}

      <TilesMap cmrCells={cells} predictedH3={predicted} maxCount={maxCount} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-medium text-slate-300">Top H3 cells (count)</h2>
          <ol className="mt-2 space-y-1 text-sm text-slate-200">
            {top10.length ? (
              top10.map((c, i) => (
                <li key={c.h3_index} className="flex justify-between gap-2">
                  <span className="text-slate-500">
                    {i + 1}. {c.h3_index.slice(0, 12)}…
                  </span>
                  <span>{c.count}</span>
                </li>
              ))
            ) : (
              <li className="text-slate-500">No granule tiles in this window yet. Run the worker / wait for CMR.</li>
            )}
          </ol>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-medium text-slate-300">Legend</h2>
          <ul className="mt-2 list-inside list-disc text-sm text-slate-400">
            <li>Cyan fill: NASA CMR data availability (H3, denser = more matching granules in window)</li>
            <li>Rose: client-side predicted sub-satellite track (H3 res 4) for tracked sats</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
