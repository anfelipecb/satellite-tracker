'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cellToBoundary } from 'h3-js';

type Cell = { h3_index: string; count: number };

type TilesCesium = {
  Viewer: new (element: Element, options: Record<string, unknown>) => CesiumViewer;
  UrlTemplateImageryProvider: new (options: Record<string, unknown>) => unknown;
  Cartesian3: {
    fromDegrees: (lon: number, lat: number, height?: number) => unknown;
    fromDegreesArray: (coords: number[]) => unknown;
  };
  PolygonHierarchy: new (positions: unknown) => unknown;
  Color: {
    fromCssColorString: (v: string) => { withAlpha: (a: number) => unknown };
  };
  Ion: { defaultAccessToken?: string };
  SceneMode: { SCENE2D: number };
};

type CesiumViewer = {
  entities: { removeAll: () => void; add: (e: Record<string, unknown>) => void };
  imageryLayers: { removeAll: () => void; addImageryProvider: (p: unknown) => void };
  scene: { mode: number };
  camera: { flyTo: (o: Record<string, unknown>) => void };
  destroy: () => void;
};

let cesiumReady: Promise<TilesCesium> | null = null;

function ensureCesium() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const w = window.Cesium as TilesCesium | undefined;
  if (w) return Promise.resolve(w);
  if (cesiumReady) return cesiumReady;
  cesiumReady = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/cesium/Widgets/widgets.css';
    document.head.appendChild(link);
    const s = document.createElement('script');
    s.src = '/cesium/Cesium.js';
    s.async = true;
    s.onload = () => {
      const C = window.Cesium as TilesCesium | undefined;
      if (!C) return reject(new Error('no cesium'));
      resolve(C);
    };
    s.onerror = () => reject(new Error('cesium load'));
    document.head.appendChild(s);
  });
  return cesiumReady;
}

function boundaryToFlat(boundary: [number, number][]) {
  const flat: number[] = [];
  for (const [lon, lat] of boundary) {
    flat.push(lon, lat);
  }
  if (flat.length >= 4 && (flat[0] !== flat[flat.length - 2] || flat[1] !== flat[flat.length - 1])) {
    flat.push(flat[0]!, flat[1]!);
  }
  return flat;
}

type Props = {
  cmrCells: Cell[];
  predictedH3: string[];
  maxCount: number;
};

export function TilesMap({ cmrCells, predictedH3, maxCount }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sortedCmr = useMemo(() => cmrCells.slice(0, 4_000), [cmrCells]);

  useEffect(() => {
    let dead = false;
    void ensureCesium()
      .then((Cesium: TilesCesium) => {
        if (dead || !containerRef.current || viewerRef.current) return;
        const ion = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
        if (ion) Cesium.Ion.defaultAccessToken = ion;
        const viewer = new Cesium.Viewer(containerRef.current, {
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          infoBox: false,
          selectionIndicator: false,
          fullscreenButton: false,
        });
        viewer.scene.mode = Cesium.SceneMode.SCENE2D;
        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            maximumLevel: 19,
          })
        );
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(-60, 25, 22_000_000),
          duration: 0.2,
        });
        viewerRef.current = viewer;
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Cesium failed'));

    return () => {
      dead = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium as TilesCesium | undefined;
    if (!viewer || !Cesium) return;
    viewer.entities.removeAll();

    const max = Math.max(1, maxCount);
    for (const c of sortedCmr) {
      let ring: [number, number][] = [];
      try {
        ring = cellToBoundary(c.h3_index, true) as [number, number][];
      } catch {
        continue;
      }
      if (ring.length < 3) continue;
      const alpha = 0.15 + 0.55 * (c.count / max);
      viewer.entities.add({
        id: `cmr-${c.h3_index}`,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(boundaryToFlat(ring))),
          material: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(Math.min(0.85, alpha)),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#0ea5e9').withAlpha(0.5),
        },
      });
    }

    const cmrSet = new Set(sortedCmr.map((x) => x.h3_index));
    for (const h of predictedH3) {
      if (cmrSet.has(h)) continue;
      let ring: [number, number][] = [];
      try {
        ring = cellToBoundary(h, true) as [number, number][];
      } catch {
        continue;
      }
      if (ring.length < 3) continue;
      viewer.entities.add({
        id: `pred-${h}`,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(boundaryToFlat(ring))),
          material: Cesium.Color.fromCssColorString('#fb7185').withAlpha(0.22),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#f43f5e').withAlpha(0.35),
        },
      });
    }
  }, [maxCount, predictedH3, sortedCmr]);

  return (
    <div className="relative h-[min(72vh,640px)] w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
      <div ref={containerRef} className="h-full w-full" />
      {err ? (
        <div className="absolute inset-x-4 top-4 rounded-lg border border-rose-400/30 bg-rose-900/40 px-3 py-2 text-sm text-rose-100">
          {err}
        </div>
      ) : null}
    </div>
  );
}
