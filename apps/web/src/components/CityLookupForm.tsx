'use client';

import { useCallback, useRef, useState } from 'react';

export type GeocodeResult = { name: string; country: string; admin1?: string; lat: number; lon: number };

type Props = {
  onPicked: (result: GeocodeResult) => void;
  onStatus?: (message: string | null) => void;
  className?: string;
};

function useDebouncedFn(fn: (term: string) => void, ms: number) {
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useCallback(
    (term: string) => {
      if (tRef.current) clearTimeout(tRef.current);
      tRef.current = setTimeout(() => {
        tRef.current = null;
        fnRef.current(term);
      }, ms);
    },
    [ms]
  );
}

export function CityLookupForm({ onPicked, onStatus, className = '' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const runSearch = useCallback(
    async (term: string) => {
      const t = term.trim();
      if (t.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      onStatus?.(null);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(t)}&count=8`);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          onStatus?.(j.error ?? 'Search failed');
          setResults([]);
          return;
        }
        const j = (await res.json()) as { results: GeocodeResult[] };
        setResults(j.results ?? []);
        setOpen((j.results ?? []).length > 0);
      } catch {
        onStatus?.('Geocoding failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [onStatus]
  );

  const debouncedSearch = useDebouncedFn(runSearch, 320);

  return (
    <div className={`relative ${className}`}>
      <label className="mb-1 block text-xs text-slate-400">Search city</label>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          debouncedSearch(v);
        }}
        onFocus={() => {
          if (results.length) setOpen(true);
        }}
        placeholder="Bogotá, Chicago, Tokyo…"
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
        autoComplete="off"
      />
      {loading ? (
        <p className="mt-2 text-xs text-slate-500">Searching…</p>
      ) : null}
      {open && results.length > 0 ? (
        <ul
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#0a1218] py-1 shadow-lg"
          role="listbox"
        >
          {results.map((r) => {
            const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
            return (
              <li key={`${r.lat},${r.lon},${label}`}>
                <button
                  type="button"
                  className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-white/5"
                  onClick={() => {
                    onPicked(r);
                    setQuery(label);
                    setOpen(false);
                    setResults([]);
                  }}
                >
                  {label}
                  <span className="ml-2 text-xs text-slate-500">
                    {r.lat.toFixed(2)}°, {r.lon.toFixed(2)}°
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
