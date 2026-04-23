'use client';

import { useUser } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { CityLookupForm, type GeocodeResult } from '@/components/CityLookupForm';
import { useSupabaseBrowser } from '@/lib/supabase/browser';

const MAX_LOCATIONS = 10;

export const dynamic = 'force-dynamic';

export default function LocationsPage() {
  const { user, isLoaded } = useUser();
  const supabase = useSupabaseBrowser();
  const [rows, setRows] = useState<
    { id: string; name: string; lat: number; lon: number; radius_km: number }[]
  >([]);
  const [name, setName] = useState('Home');
  const [lat, setLat] = useState('41.8781');
  const [lon, setLon] = useState('-87.6298');
  const [msg, setMsg] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [staged, setStaged] = useState<GeocodeResult | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_locations')
      .select('id,name,lat,lon,radius_km')
      .order('created_at', { ascending: false });
    if (error) setMsg(error.message);
    else {
      setMsg(null);
      setRows(data ?? []);
    }
  }, [supabase]);

  useEffect(() => {
    if (isLoaded && user) void refresh();
  }, [isLoaded, user, refresh]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!user?.id) {
      setMsg('Not signed in');
      return;
    }
    if (rows.length >= MAX_LOCATIONS) {
      setMsg(`Maximum ${MAX_LOCATIONS} locations (demo soft limit).`);
      return;
    }
    const { error } = await supabase.from('user_locations').insert({
      user_id: user.id,
      name,
      lat: Number(lat),
      lon: Number(lon),
      radius_km: 0,
      last_viewed_at: new Date().toISOString(),
    });
    if (error) setMsg(error.message);
    else {
      setName('Home');
      await refresh();
    }
  }

  function onCityStaged(r: GeocodeResult) {
    setMsg(null);
    setStaged(r);
    setName([r.name, r.country].filter(Boolean).join(', '));
    setLat(String(r.lat));
    setLon(String(r.lon));
  }

  async function onSaveStaged() {
    setMsg(null);
    if (!user?.id) {
      setMsg('Not signed in');
      return;
    }
    if (!staged) {
      setMsg('Search and pick a city, then press Save');
      return;
    }
    if (rows.length >= MAX_LOCATIONS) {
      setMsg(`Maximum ${MAX_LOCATIONS} locations (demo soft limit).`);
      return;
    }
    const label = [staged.name, staged.country].filter(Boolean).join(', ');
    const { error } = await supabase.from('user_locations').insert({
      user_id: user.id,
      name: label,
      lat: staged.lat,
      lon: staged.lon,
      radius_km: 0,
      last_viewed_at: new Date().toISOString(),
    });
    if (error) setMsg(error.message);
    else {
      setStaged(null);
      setName('Home');
      await refresh();
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from('user_locations').delete().eq('id', id);
    if (error) setMsg(error.message);
    else await refresh();
  }

  async function touch(id: string) {
    await supabase.from('user_locations').update({ last_viewed_at: new Date().toISOString() }).eq('id', id);
    await refresh();
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Saved locations</h1>
        <p className="text-sm text-slate-400">
          Up to {MAX_LOCATIONS} locations per user. The worker prioritizes locations viewed in the last 7
          days.
        </p>
      </div>
      <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <CityLookupForm onPicked={onCityStaged} onStatus={setMsg} />
        {staged ? (
          <p className="text-sm text-slate-300">
            Selected: <span className="font-medium text-white">{[staged.name, staged.country].filter(Boolean).join(', ')}</span>
            <span className="text-slate-500"> — use Save to store it.</span>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onSaveStaged()}
            disabled={!staged || !isLoaded || !user}
            className="rounded-full bg-aurora px-4 py-2.5 text-sm font-medium text-void disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save location
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowManual((s) => !s);
            if (showManual) setStaged(null);
          }}
          className="text-xs text-aurora/90 underline-offset-2 hover:underline"
        >
          {showManual ? 'Hide' : 'Add'} manual coordinates
        </button>
        {showManual ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Label
                <input
                  value={name}
                  onChange={(e) => {
                    setStaged(null);
                    setName(e.target.value);
                  }}
                  className="rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                  required
                />
              </label>
              <div />
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Latitude
                <input
                  value={lat}
                  onChange={(e) => {
                    setStaged(null);
                    setLat(e.target.value);
                  }}
                  className="rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Longitude
                <input
                  value={lon}
                  onChange={(e) => {
                    setStaged(null);
                    setLon(e.target.value);
                  }}
                  className="rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                  required
                />
              </label>
            </div>
            <button
              type="submit"
              className="rounded-full border border-aurora/40 bg-aurora/20 px-4 py-2 text-sm font-medium text-aurora"
              disabled={!isLoaded || !user}
            >
              Save manual location
            </button>
          </form>
        ) : null}
        {msg ? <p className="text-sm text-rose-400">{msg}</p> : null}
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
          >
            <span>
              <span className="font-medium text-white">{r.name}</span>{' '}
              <span className="text-slate-500">
                {r.lat.toFixed(4)}, {r.lon.toFixed(4)}
              </span>
            </span>
            <span className="flex gap-2">
              <button type="button" className="text-aurora hover:underline" onClick={() => touch(r.id)}>
                Mark active
              </button>
              <button type="button" className="text-rose-400 hover:underline" onClick={() => remove(r.id)}>
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
