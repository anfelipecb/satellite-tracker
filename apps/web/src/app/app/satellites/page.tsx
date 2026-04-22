'use client';

import { useUser } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useSupabaseBrowser } from '@/lib/supabase/browser';

export default function SatellitesPage() {
  const { user, isLoaded } = useUser();
  const supabase = useSupabaseBrowser();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ norad_id: number; name: string }[]>([]);
  const [favorites, setFavorites] = useState<{ norad_id: number }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const loadFavorites = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('user_tracked_satellites').select('norad_id').eq('user_id', user.id);
    setFavorites(data ?? []);
  }, [supabase, user?.id]);

  useEffect(() => {
    if (isLoaded && user) void loadFavorites();
  }, [isLoaded, user, loadFavorites]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const term = q.trim();
    if (!term) return;
    const { data, error } = await supabase
      .from('satellites')
      .select('norad_id,name')
      .ilike('name', `%${term}%`)
      .limit(40);
    if (error) setMsg(error.message);
    else setResults(data ?? []);
  }

  async function addFavorite(noradId: number) {
    if (!user?.id) return;
    const { error } = await supabase.from('user_tracked_satellites').upsert(
      { user_id: user.id, norad_id: noradId },
      { onConflict: 'user_id,norad_id' }
    );
    if (error) setMsg(error.message);
    else await loadFavorites();
  }

  async function removeFavorite(noradId: number) {
    if (!user?.id) return;
    const { error } = await supabase
      .from('user_tracked_satellites')
      .delete()
      .eq('user_id', user.id)
      .eq('norad_id', noradId);
    if (error) setMsg(error.message);
    else await loadFavorites();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Satellites</h1>
        <p className="text-sm text-slate-400">
          Search the NORAD catalog synced by the worker from CelesTrak. Favorites power your dashboard
          widgets.
        </p>
      </div>
      <form onSubmit={search} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name (e.g. ISS, STARLINK)"
          className="flex-1 rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
        />
        <button type="submit" className="rounded-full bg-aurora px-4 py-2 text-sm font-medium text-void">
          Search
        </button>
      </form>
      {msg ? <p className="text-sm text-rose-400">{msg}</p> : null}
      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">Results</h2>
        <ul className="space-y-1 text-sm">
          {results.map((r) => (
            <li key={r.norad_id} className="flex items-center justify-between rounded border border-white/5 px-2 py-1">
              <span>
                {r.name} <span className="text-slate-500">({r.norad_id})</span>
              </span>
              <button type="button" className="text-aurora hover:underline" onClick={() => addFavorite(r.norad_id)}>
                Track
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">Your favorites</h2>
        <ul className="space-y-1 text-sm">
          {favorites.map((f) => (
            <li key={f.norad_id} className="flex items-center justify-between rounded border border-white/5 px-2 py-1">
              <span>NORAD {f.norad_id}</span>
              <button type="button" className="text-rose-400 hover:underline" onClick={() => removeFavorite(f.norad_id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
