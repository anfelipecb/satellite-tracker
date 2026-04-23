'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  value: number | null;
  className?: string;
  format?: (n: number) => string;
  durationMs?: number;
};

const defaultFormat = (n: number) => String(Math.round(n));

/**
 * Tweened display when the source value changes.
 */
export function AnimatedNumber({ value, className, format = defaultFormat, durationMs = 420 }: Props) {
  const [display, setDisplay] = useState<number | null>(value);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (value === null) {
      lastRef.current = null;
      setDisplay(null);
      return;
    }

    const from = lastRef.current ?? value;
    let start: number | null = null;
    const anim = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      const e = 1 - (1 - t) ** 3;
      const next = from + (value - from) * e;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(anim);
      } else {
        lastRef.current = value;
        rafRef.current = null;
        setDisplay(value);
      }
    };
    rafRef.current = requestAnimationFrame(anim);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  if (value === null && display === null) {
    return <span className={className}>—</span>;
  }

  return <span className={className}>{format(display ?? value ?? 0)}</span>;
}
