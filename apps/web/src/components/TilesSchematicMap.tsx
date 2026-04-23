'use client';

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { cellToBoundary, cellToLatLng } from 'h3-js';
import { WorldBasemap } from '@/components/WorldBasemap';

type Cell = { h3_index: string; count: number };

const W = 720;
const H = 360;

function project(lon: number, lat: number) {
  const x = ((lon + 180) / 360) * W;
  const y = ((90 - lat) / 180) * H;
  return { x, y };
}

function unproject(x: number, y: number) {
  const lon = (x / W) * 360 - 180;
  const lat = 90 - (y / H) * 180;
  return { lon, lat };
}

function ringToPathD(ring: [number, number][]) {
  if (ring.length < 2) return '';
  const p0 = project(ring[0]![0], ring[0]![1]);
  const parts: string[] = [`M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)}`];
  for (let i = 1; i < ring.length; i++) {
    const [lon, lat] = ring[i]!;
    const p = project(lon, lat);
    parts.push(`L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

type Props = {
  cmrCells: Cell[];
  predictedH3: string[];
  maxCount: number;
  mission: string;
  /** Total hours covered by the aggregation window (used in overlay labels). */
  hours: number;
  /** Short human label for the range (e.g. "24h", "7d", "30d"). */
  rangeLabel: string;
  /** Timestamp of the last successful aggregate refresh (ISO). */
  updatedAt: string | null;
  selectedH3: string | null;
  onSelectH3: (h3: string | null) => void;
};

export function TilesSchematicMap({
  cmrCells,
  predictedH3,
  maxCount,
  mission,
  hours,
  rangeLabel,
  updatedAt,
  selectedH3,
  onSelectH3,
}: Props) {
  const gradId = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<{ h3: string; count: number } | null>(null);
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);

  const graticule = useMemo(() => {
    const paths: { d: string; key: string }[] = [];
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = ((lon + 180) / 360) * W;
      paths.push({ key: `v${lon}`, d: `M ${x} 0 L ${x} ${H}` });
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = ((90 - lat) / 180) * H;
      paths.push({ key: `h${lat}`, d: `M 0 ${y} L ${W} ${y}` });
    }
    return paths;
  }, []);

  const lonLabels = useMemo(() => {
    const labels: { x: number; text: string }[] = [];
    for (let lon = -150; lon <= 150; lon += 30) {
      const x = ((lon + 180) / 360) * W;
      const dir = lon === 0 ? '0°' : `${Math.abs(lon)}°${lon > 0 ? 'E' : 'W'}`;
      labels.push({ x, text: dir });
    }
    return labels;
  }, []);

  const latLabels = useMemo(() => {
    const labels: { y: number; text: string }[] = [];
    for (const lat of [-60, -30, 0, 30, 60]) {
      const y = ((90 - lat) / 180) * H;
      const text = lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`;
      labels.push({ y, text });
    }
    return labels;
  }, []);

  const sortedCmr = useMemo(() => {
    return [...cmrCells].filter((c) => c.h3_index).sort((a, b) => a.count - b.count);
  }, [cmrCells]);

  const cmrPaths = useMemo(() => {
    const max = Math.max(1, maxCount);
    const out: { d: string; h3: string; count: number; fill: string; stroke: string }[] = [];
    for (const c of sortedCmr) {
      let ring: [number, number][] = [];
      try {
        ring = cellToBoundary(c.h3_index, true) as [number, number][];
      } catch {
        continue;
      }
      if (ring.length < 3) continue;
      const d = ringToPathD(ring);
      if (!d) continue;
      const t = c.count / max;
      const alpha = 0.18 + 0.7 * t;
      out.push({
        d,
        h3: c.h3_index,
        count: c.count,
        fill: `rgba(56, 189, 248, ${Math.min(0.92, alpha)})`,
        stroke: 'rgba(14, 165, 233, 0.6)',
      });
    }
    return out;
  }, [maxCount, sortedCmr]);

  const predSet = useMemo(() => new Set(sortedCmr.map((c) => c.h3_index)), [sortedCmr]);
  const predPaths = useMemo(() => {
    const out: { d: string; h3: string }[] = [];
    for (const h of predictedH3) {
      if (predSet.has(h)) continue;
      let ring: [number, number][] = [];
      try {
        ring = cellToBoundary(h, true) as [number, number][];
      } catch {
        continue;
      }
      if (ring.length < 3) continue;
      const d = ringToPathD(ring);
      if (d) out.push({ d, h3: h });
    }
    return out;
  }, [predictedH3, predSet]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onSelectH3(null);
    },
    [onSelectH3],
  );

  const totalObs = useMemo(() => cmrCells.reduce((s, c) => s + c.count, 0), [cmrCells]);
  const coveragePct = useMemo(() => {
    if (!cmrPaths.length) return 0;
    const totalRes4Cells = 5882; // h3 res-4 total cell count (approx., used for % of globe)
    return Math.min(100, (cmrPaths.length / totalRes4Cells) * 100);
  }, [cmrPaths.length]);

  const selectedMeta = useMemo(() => {
    if (!selectedH3) return null;
    const row = cmrCells.find((c) => c.h3_index === selectedH3);
    let center: { lat: number; lon: number } | null = null;
    try {
      const ll = cellToLatLng(selectedH3) as [number, number];
      center = { lat: ll[0], lon: ll[1] };
    } catch {
      /* malformed cell */
    }
    return { count: row?.count ?? null, center };
  }, [cmrCells, selectedH3]);

  const hasData = cmrPaths.length > 0 || predPaths.length > 0;

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xSvg = ((e.clientX - rect.left) / rect.width) * W;
    const ySvg = ((e.clientY - rect.top) / rect.height) * H;
    if (xSvg < 0 || xSvg > W || ySvg < 0 || ySvg > H) {
      setCursor(null);
      return;
    }
    const { lat, lon } = unproject(xSvg, ySvg);
    setCursor({ lat, lon });
  }, []);

  const onPointerLeave = useCallback(() => {
    setCursor(null);
    setHover(null);
  }, []);

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#04080c]"
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="img"
      aria-label="H3 granule availability schematic map with world basemap"
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-[min(62vh,480px)] w-full touch-manipulation"
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0c1a28" />
            <stop offset="55%" stopColor="#06101a" />
            <stop offset="100%" stopColor="#03080d" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill={`url(#${gradId})`} />

        <WorldBasemap
          width={W}
          height={H}
          fill="rgba(148, 163, 184, 0.09)"
          stroke="rgba(148, 163, 184, 0.32)"
          strokeWidth={0.6}
        />

        {graticule.map((g) => (
          <path key={g.key} d={g.d} fill="none" stroke="rgba(148, 163, 184, 0.08)" strokeWidth={0.5} />
        ))}
        <path
          d={`M 0 ${H / 2} L ${W} ${H / 2}`}
          fill="none"
          stroke="rgba(250, 204, 21, 0.18)"
          strokeWidth={0.8}
          strokeDasharray="4 4"
        />

        {latLabels.map((l) => (
          <text
            key={`lat-${l.text}`}
            x={4}
            y={l.y - 2}
            fontSize={9}
            fill="rgba(203, 213, 225, 0.5)"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {l.text}
          </text>
        ))}
        {lonLabels.map((l) => (
          <text
            key={`lon-${l.text}-${l.x}`}
            x={l.x + 2}
            y={H - 4}
            fontSize={9}
            fill="rgba(203, 213, 225, 0.5)"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {l.text}
          </text>
        ))}

        {cmrPaths.map((p) => {
          const isSel = selectedH3 === p.h3;
          const isHov = hover?.h3 === p.h3;
          return (
            <path
              key={p.h3}
              d={p.d}
              fill={p.fill}
              stroke={isSel ? 'rgba(250, 204, 21, 0.95)' : isHov ? 'rgba(255,255,255,0.7)' : p.stroke}
              strokeWidth={isSel ? 2 : 0.9}
              className="cursor-pointer transition-opacity hover:opacity-95"
              onClick={() => onSelectH3(p.h3 === selectedH3 ? null : p.h3)}
              onPointerEnter={() => setHover({ h3: p.h3, count: p.count })}
              onPointerLeave={() => setHover(null)}
            />
          );
        })}

        {predPaths.map((p) => (
          <path
            key={`pred-${p.h3}`}
            d={p.d}
            fill="rgba(251, 113, 133, 0.14)"
            stroke="rgba(244, 63, 94, 0.55)"
            strokeWidth={0.9}
            className="pointer-events-none"
          />
        ))}

        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="none"
          stroke="rgba(148, 163, 184, 0.28)"
          strokeWidth={0.8}
        />
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 space-y-1">
        <div className="rounded-lg border border-white/15 bg-black/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300 shadow">
          {mission} · last {rangeLabel}
        </div>
        <div className="rounded-lg border border-cyan-400/30 bg-black/60 px-2.5 py-1 font-mono text-[11px] text-cyan-100 shadow">
          cells <span className="text-white">{cmrPaths.length}</span> · Σ obs{' '}
          <span className="text-white">{totalObs}</span> · coverage{' '}
          <span className="text-white">{coveragePct.toFixed(2)}%</span>
        </div>
        {updatedAt ? (
          <div className="rounded-lg border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] text-slate-400">
            updated {new Date(updatedAt).toLocaleTimeString()} · equirectangular · H3 res-4
          </div>
        ) : null}
      </div>

      {hover ? (
        <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-cyan-400/35 bg-black/75 px-2.5 py-1 font-mono text-[11px] text-cyan-100 shadow">
          hover <span className="text-slate-400">cell</span>{' '}
          <span className="text-white">{hover.h3.slice(0, 12)}…</span>{' '}
          <span className="text-slate-400">obs</span> <span className="text-white">{hover.count}</span>
        </div>
      ) : cursor ? (
        <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-white/15 bg-black/70 px-2.5 py-1 font-mono text-[11px] text-slate-200 shadow">
          <span className="text-slate-400">cursor</span>{' '}
          <span className="text-white">
            {Math.abs(cursor.lat).toFixed(2)}°{cursor.lat >= 0 ? 'N' : 'S'}
          </span>{' '}
          <span className="text-white">
            {Math.abs(cursor.lon).toFixed(2)}°{cursor.lon >= 0 ? 'E' : 'W'}
          </span>
        </div>
      ) : null}

      {!hasData ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 px-4 text-center">
          <p className="max-w-sm text-sm text-slate-300">
            No granule tiles in this window. Pick a wider range or run the CMR worker — the schematic will fill as{' '}
            <code className="text-cyan-300/90">granule_tiles</code> gets data.
          </p>
        </div>
      ) : null}

      {selectedH3 ? (
        <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-cyan-500/40 bg-[#0a1218]/95 p-3 text-sm text-slate-200 shadow-lg md:left-auto md:right-3 md:top-20 md:max-w-xs">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Selected cell</p>
          <p className="mt-1 break-all font-mono text-xs text-cyan-200">{selectedH3}</p>
          {selectedMeta?.center ? (
            <p className="mt-2 font-mono text-xs text-slate-300">
              center{' '}
              <span className="text-white">
                {Math.abs(selectedMeta.center.lat).toFixed(3)}°{selectedMeta.center.lat >= 0 ? 'N' : 'S'}
              </span>{' '}
              <span className="text-white">
                {Math.abs(selectedMeta.center.lon).toFixed(3)}°{selectedMeta.center.lon >= 0 ? 'E' : 'W'}
              </span>
            </p>
          ) : null}
          <p className="mt-2 text-slate-400">
            Count: <strong className="text-white">{selectedMeta?.count ?? '—'}</strong> · window:{' '}
            <span className="text-white">{hours}h</span>
          </p>
          <button
            type="button"
            className="mt-2 text-xs text-rose-300 hover:underline"
            onClick={() => onSelectH3(null)}
          >
            Clear selection
          </button>
        </div>
      ) : null}
    </div>
  );
}
