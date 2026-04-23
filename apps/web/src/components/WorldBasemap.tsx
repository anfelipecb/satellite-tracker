'use client';

import { useEffect, useState } from 'react';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

/**
 * Low-resolution equirectangular land outline rendered as SVG <path> strings.
 *
 * The land-110m topojson is ~100KB and covers the whole planet at a
 * coarse resolution that's perfect for a schematic dashboard backdrop.
 * Continents are pre-computed once on mount and cached in module scope.
 */

type RenderProps = {
  /** SVG viewBox width in user units. */
  width: number;
  /** SVG viewBox height in user units. */
  height: number;
  /** CSS fill colour for land polygons (recommend low-alpha so cells read on top). */
  fill?: string;
  /** CSS stroke colour for the coastlines. */
  stroke?: string;
  /** Stroke width in user units. */
  strokeWidth?: number;
};

let cachePaths: { w: number; h: number; paths: string[] } | null = null;
let inFlight: Promise<string[]> | null = null;

async function loadLandPaths(width: number, height: number): Promise<string[]> {
  if (cachePaths && cachePaths.w === width && cachePaths.h === height) return cachePaths.paths;
  if (inFlight) return inFlight;
  const promise = (async () => {
    const res = await fetch('/world-atlas/land-110m.json');
    if (!res.ok) throw new Error(`basemap fetch ${res.status}`);
    const topology = (await res.json()) as Topology<{ land: GeometryCollection }>;
    if (!topology?.objects?.land) {
      throw new Error('basemap topology missing objects.land');
    }
    const landResult = feature(topology, topology.objects.land) as unknown as
      | Feature<Polygon | MultiPolygon>
      | FeatureCollection<Polygon | MultiPolygon>;
    const geometries: (Polygon | MultiPolygon)[] =
      'features' in landResult
        ? landResult.features.map((f) => f.geometry)
        : [landResult.geometry];
    const project = (lon: number, lat: number) => {
      const x = ((lon + 180) / 360) * width;
      const y = ((90 - lat) / 180) * height;
      return `${x.toFixed(2)} ${y.toFixed(2)}`;
    };
    const ringToPath = (ring: number[][]): string => {
      if (ring.length < 2) return '';
      const head = ring[0]!;
      const parts: string[] = [`M ${project(head[0]!, head[1]!)}`];
      for (let i = 1; i < ring.length; i++) {
        const p = ring[i]!;
        parts.push(`L ${project(p[0]!, p[1]!)}`);
      }
      parts.push('Z');
      return parts.join(' ');
    };
    const paths: string[] = [];
    for (const geom of geometries) {
      if (geom.type === 'Polygon') {
        for (const ring of geom.coordinates) paths.push(ringToPath(ring));
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) for (const ring of poly) paths.push(ringToPath(ring));
      }
    }
    const filtered = paths.filter(Boolean);
    cachePaths = { w: width, h: height, paths: filtered };
    return filtered;
  })();
  inFlight = promise;
  try {
    return await promise;
  } catch (err) {
    inFlight = null;
    throw err;
  }
}

export function WorldBasemap({
  width,
  height,
  fill = 'rgba(56, 189, 248, 0.06)',
  stroke = 'rgba(148, 163, 184, 0.28)',
  strokeWidth = 0.5,
}: RenderProps) {
  const [paths, setPaths] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadLandPaths(width, height).then((p) => {
      if (!cancelled) setPaths(p);
    });
    return () => {
      cancelled = true;
    };
  }, [width, height]);

  if (!paths) return null;

  return (
    <g aria-hidden>
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}
