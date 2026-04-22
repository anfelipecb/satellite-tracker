'use client';

import { useUser } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useSupabaseBrowser } from '@/lib/supabase/browser';
import { elevationDegForObserver, type TleRow } from '@/lib/sgp4';
import type { N2yoVisualPassesResponse } from '@satellite-tracker/shared';

type LaunchRow = {
  id: string;
  name: string;
  net_utc: string | null;
  status: string | null;
  vehicle: string | null;
  provider: string | null;
};

export function DashboardClient() {
  const { user, isLoaded } = useUser();
  const supabase = useSupabaseBrowser();
  const [kp, setKp] = useState<number | null>(null);
  const [launches, setLaunches] = useState<LaunchRow[]>([]);
  const [overhead, setOverhead] = useState<{ loc: string; sgp4?: number; n2yo?: number }[]>([]);
  const [starlink, setStarlink] = useState<number | null>(null);
  const [passes, setPasses] = useState<string | null>(null);
  const [loc, setLoc] = useState<{ id: string; name: string; lat: number; lon: number } | null>(null);

  const refreshStatic = useCallback(async () => {
    const { data: sw } = await supabase.from('space_weather').select('kp').order('ts', { ascending: false }).limit(1).maybeSingle();
    setKp(sw?.kp ?? null);

    const { data: ls } = await supabase.from('launches').select('*').order('net_utc', { ascending: true }).limit(8);
    setLaunches((ls as LaunchRow[] | null) ?? []);

    if (!user?.id) return;
    const { data: locs } = await supabase
      .from('user_locations')
      .select('id,name,lat,lon')
      .order('created_at', { ascending: false })
      .limit(1);
    const primary = locs?.[0];
    if (!primary) {
      setLoc(null);
      return;
    }
    setLoc(primary);

    const { data: oc } = await supabase
      .from('overhead_counts')
      .select('count,source,ts_minute')
      .eq('user_location_id', primary.id)
      .order('ts_minute', { ascending: false })
      .limit(20);

    const latestSgp4 = oc?.find((r) => r.source === 'sgp4');
    const latestN2yo = oc?.find((r) => r.source === 'n2yo');
    setOverhead([
      {
        loc: primary.name,
        sgp4: latestSgp4?.count,
        n2yo: latestN2yo?.count,
      },
    ]);

    const fav = await supabase.from('user_tracked_satellites').select('norad_id').eq('user_id', user.id).limit(1);
    const norad = fav.data?.[0]?.norad_id ?? 25544;
    try {
      const resP = await fetch(
        `/api/n2yo/visualpasses?id=${norad}&lat=${primary.lat}&lng=${primary.lon}&alt=0&days=1&min_visibility=120`
      );
      if (resP.ok) {
        const j = (await resP.json()) as N2yoVisualPassesResponse;
        setPasses(`${j.info.satname ?? 'Sat'} — ${j.passes.length} visible pass window(s) in next day (N2YO)`);
      }
    } catch {
      setPasses(null);
    }
  }, [supabase, user?.id]);

  useEffect(() => {
    if (!isLoaded || !user) return;
    void refreshStatic();
  }, [isLoaded, user, refreshStatic]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'space_weather' },
        () => void refreshStatic()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'launches' },
        () => void refreshStatic()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'overhead_counts' },
        () => void refreshStatic()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, user, refreshStatic]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!loc || !user?.id) return;
      const { data: sats } = await supabase.from('satellites').select('norad_id').ilike('name', '%STARLINK%').limit(300);
      const ids = (sats ?? []).map((s) => s.norad_id);
      if (!ids.length) return;
      const { data: tles } = await supabase
        .from('tles')
        .select('norad_id,line1,line2,epoch')
        .in('norad_id', ids)
        .order('epoch', { ascending: false })
        .limit(2000);
      if (!tles || cancelled) return;
      const seen = new Set<number>();
      const rows: TleRow[] = [];
      for (const t of tles) {
        if (seen.has(t.norad_id)) continue;
        seen.add(t.norad_id);
        rows.push({ norad_id: t.norad_id, line1: t.line1, line2: t.line2 });
        if (rows.length >= 250) break;
      }
      const now = new Date();
      let c = 0;
      for (const r of rows) {
        const el = elevationDegForObserver(r, now, loc.lat, loc.lon);
        if (el !== null && el >= 10) c++;
      }
      if (!cancelled) setStarlink(c);
    })();
    return () => {
      cancelled = true;
    };
  }, [loc, supabase, user?.id]);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-medium text-slate-400">Planetary K-index (latest)</h2>
        <p className="mt-2 text-3xl font-semibold text-white">{kp ?? '—'}</p>
        <p className="mt-1 text-xs text-slate-500">NOAA SWPC via worker</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-medium text-slate-400">Starlink overhead (SGP4, now)</h2>
        <p className="mt-2 text-3xl font-semibold text-white">{starlink ?? '—'}</p>
        <p className="mt-1 text-xs text-slate-500">Elevation ≥10° at your primary saved location</p>
      </div>
      <div className="md:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-medium text-slate-400">Overhead counts (worker)</h2>
        {overhead.length ? (
          <ul className="mt-2 space-y-1 text-sm text-slate-200">
            {overhead.map((o) => (
              <li key={o.loc}>
                <span className="font-medium text-white">{o.loc}</span>: SGP4{' '}
                <span className="text-aurora">{o.sgp4 ?? '—'}</span> · N2YO snapshot{' '}
                <span className="text-ember">{o.n2yo ?? '—'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Save a location so the worker can compute overhead_counts.</p>
        )}
      </div>
      <div className="md:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-medium text-slate-400">Visual passes (N2YO)</h2>
        <p className="mt-2 text-sm text-slate-200">{passes ?? 'Save a location and a favorite satellite.'}</p>
      </div>
      <div className="md:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-medium text-slate-400">Upcoming launches</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {launches.map((l) => (
            <li key={l.id} className="flex flex-wrap justify-between gap-2 border-b border-white/5 py-1">
              <span className="text-white">{l.name}</span>
              <span className="text-slate-400">
                {l.net_utc ? new Date(l.net_utc).toLocaleString() : 'TBD'} · {l.status ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
