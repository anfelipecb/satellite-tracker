'use client';

import { useEffect, useState } from 'react';

function formatCountdown(netUtc: string | null) {
  if (!netUtc) return 'TBD';
  const t = new Date(netUtc).getTime() - Date.now();
  if (t <= 0) return 'L-now';
  const s = Math.floor(t / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `T-${d}d ${h}h ${m}m`;
  if (h > 0) return `T-${h}h ${m}m ${sec}s`;
  return `T-${m}m ${sec}s`;
}

type Props = {
  netUtc: string | null;
  className?: string;
};

/**
 * Ticks every second to keep T- time live.
 */
export function LaunchCountdown({ netUtc, className = '' }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className={className}>{formatCountdown(netUtc)}</span>;
}
