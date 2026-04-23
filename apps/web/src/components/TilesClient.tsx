'use client';

import { useUser } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { latLngToCell } from 'h3-js';
import { useSupabaseBrowser } from '@/lib/supabase/browser';
import { propagatePositionDeg, type TleRow } from '@/lib/sgp4';
import { TilesSchematicMap } from '@/components/TilesSchematicMap';

const MISSIONS = [
  { value: 'MOD09GA', label: 'MODIS Terra (MOD09GA)' },
  { value: 'MYD09GA', label: 'MODIS Aqua (MYD09GA)' },
  { value: 'LANDSAT_OT_C2_L2', label: 'Landsat OLI-2' },
  { value: 'S2A_MSIL2A', label: 'Sentinel-2A (L2A)' },
] as const;

const RANGES = [
  { hours: 24, label: '24h' },
  { hours: 24 * 7, label: '7d' },
  { hours: 24 * 30, label: '30d' },
] as const;

const H3_RES = 4;

export function TilesClient() {
  const { user, isLoaded } = useUser();
  const supabase = useSupabaseBrowser();
  const [mission, setMission] = useState<string>('MOD09GA');
  const [hours, setHours] = useState<number>(24);
  const [cells, setCells] = useState<{ h3_index: string; count: number }[]>([]);
  const [predicted, setPredicted] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedH3, setSelectedH3] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const maxCount = useMemo(() => cells.reduce((m, c) => Math.max(m, c.count), 0), [cells]);

  const rangeLabel = useMemo(() => {
    const match = RANGES.find((r) => r.hours === hours);
    if (match) return match.label;
    if (hours >= 24) return `${Math.round(hours / 24)}d`;
    return `${hours}h`;
  }, [hours]);

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
      setUpdatedAt(new Date().toISOString());
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

  // Debounce realtime refreshes so large CMR backfills don't spawn a fetch
  // per INSERT row (which exhausts browser connection pools).
  const refreshTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!user) return;
    const scheduleRefresh = () => {
      if (refreshTimerRef.current != null) return;
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        void loadAggregate();
      }, 4_000);
    };
    const channel = supabase
      .channel('tiles-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'granule_tiles' }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'granules' }, scheduleRefresh)
      .subscribe();
    return () => {
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [loadAggregate, supabase, user]);

  const top10 = useMemo(() => cells.slice(0, 10), [cells]);
  const totalObs = useMemo(() => cells.reduce((s, c) => s + c.count, 0), [cells]);
  const uniqueCells = cells.length;

  useEffect(() => {
    if (!selectedH3) return;
    if (!cells.some((c) => c.h3_index === selectedH3)) setSelectedH3(null);
  }, [cells, selectedH3]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">
        Schematic 2D availability board — NASA CMR granules from the worker are hashed to H3 (res 4) in{' '}
        <code className="text-aurora">granule_tiles</code> and rendered on an equirectangular world map. Cyan cells:
        data availability in the selected window. Rose: predicted sub-satellite H3 for your tracked satellites. Live
        updates on insert; pick 24h / 7d / 30d to see recent or monthly coverage.
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

        <div className="flex flex-col gap-1 text-xs text-slate-500">
          Range
          <div className="inline-flex overflow-hidden rounded-xl border border-white/10 bg-black/30">
            {RANGES.map((r) => (
              <button
                key={r.hours}
                type="button"
                onClick={() => setHours(r.hours)}
                className={`px-3 py-2 text-sm transition ${
                  hours === r.hours
                    ? 'bg-cyan-500/25 text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.5)]'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                {r.label}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={720}
              value={hours}
              onChange={(e) => setHours(Math.max(1, Math.min(720, Number(e.target.value) || 24)))}
              className="w-20 border-l border-white/10 bg-transparent px-2 py-2 text-sm text-white outline-none"
              aria-label="Custom window in hours"
            />
          </div>
        </div>

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

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="H3 cells covered" value={uniqueCells.toLocaleString()} accent="cyan" />
        <StatTile label="Total observations" value={totalObs.toLocaleString()} accent="cyan" />
        <StatTile label="Peak per-cell" value={maxCount ? maxCount.toLocaleString() : '—'} accent="amber" />
        <StatTile
          label="Predicted sub-sat cells"
          value={predicted.length.toLocaleString()}
          accent="rose"
        />
      </div>

      <TilesSchematicMap
        cmrCells={cells}
        predictedH3={predicted}
        maxCount={maxCount}
        mission={mission}
        hours={hours}
        rangeLabel={rangeLabel}
        updatedAt={updatedAt}
        selectedH3={selectedH3}
        onSelectH3={setSelectedH3}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-medium text-slate-300">Top H3 cells (count)</h2>
          <ol className="mt-2 space-y-1 text-sm text-slate-200">
            {top10.length ? (
              top10.map((c, i) => (
                <li key={c.h3_index}>
                  <button
                    type="button"
                    onClick={() => setSelectedH3(c.h3_index === selectedH3 ? null : c.h3_index)}
                    className={`flex w-full justify-between gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-white/5 ${
                      selectedH3 === c.h3_index ? 'bg-cyan-500/15 ring-1 ring-cyan-400/40' : ''
                    }`}
                  >
                    <span className="text-slate-500">
                      {i + 1}. {c.h3_index.slice(0, 12)}…
                    </span>
                    <span className="tabular-nums text-slate-200">{c.count}</span>
                  </button>
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
            <li>Muted continents: static Natural Earth 110m world basemap (equirectangular)</li>
            <li>Cyan fill: NASA CMR data availability (H3 res-4, denser = more matching granules in window)</li>
            <li>Rose: client-side predicted sub-satellite track (H3 res-4) for tracked sats</li>
            <li>Yellow dashed: equator · gridlines every 30° · hover for cell & cursor coordinates</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'cyan' | 'amber' | 'rose';
}) {
  const accentClass =
    accent === 'cyan'
      ? 'border-cyan-400/25 bg-cyan-500/5 text-cyan-200'
      : accent === 'amber'
        ? 'border-amber-400/25 bg-amber-500/5 text-amber-200'
        : 'border-rose-400/25 bg-rose-500/5 text-rose-200';
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-inner ${accentClass}`}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
