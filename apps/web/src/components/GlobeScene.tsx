'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type GlobePoint = { id: number; lat: number; lon: number; altKm: number };
export type LivePathPoint = { lat: number; lon: number; altKm: number };

export type OrbitTrack = {
  id: string;
  positions: LivePathPoint[];
  color?: string;
  width?: number;
};

export type ObserverPoint = {
  id: string;
  label: string;
  lat: number;
  lon: number;
};

type Props = {
  points: GlobePoint[];
  tracks?: OrbitTrack[];
  livePath?: LivePathPoint[] | null;
  focus?: { lat: number; lon: number; altKm: number } | null;
  observer?: ObserverPoint | null;
};

type CesiumGlobal = {
  Viewer: new (element: Element, options: Record<string, unknown>) => CesiumViewer;
  UrlTemplateImageryProvider: new (options: Record<string, unknown>) => unknown;
  Cartesian2: new (x: number, y: number) => unknown;
  Cartesian3: {
    fromDegrees: (lon: number, lat: number, height?: number) => unknown;
    fromDegreesArrayHeights: (coords: number[]) => unknown;
  };
  Color: {
    CYAN: { withAlpha: (value: number) => unknown };
    HOTPINK: unknown;
    ORANGE: unknown;
    WHITE: unknown;
    BLACK: { withAlpha: (value: number) => unknown };
    fromCssColorString: (value: string) => { withAlpha: (alpha: number) => unknown };
  };
  Ion: {
    defaultAccessToken?: string;
  };
};

type CesiumViewer = {
  entities: {
    removeAll: () => void;
    add: (entity: Record<string, unknown>) => void;
  };
  imageryLayers: {
    removeAll: () => void;
    addImageryProvider: (provider: unknown) => void;
  };
  camera: {
    flyTo: (options: Record<string, unknown>) => void;
  };
  destroy: () => void;
};

declare global {
  interface Window {
    Cesium?: CesiumGlobal;
  }
}

let cesiumReadyPromise: Promise<CesiumGlobal> | null = null;

function ensureCesium() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Cesium is only available in the browser.'));
  }

  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (cesiumReadyPromise) return cesiumReadyPromise;

  cesiumReadyPromise = new Promise(async (resolve, reject) => {
    const cssId = 'cesium-widgets-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = '/cesium/Widgets/widgets.css';
      document.head.appendChild(link);
    }

    try {
      const loadCesiumModule = new Function(
        'return import("/cesium-runtime.js")'
      ) as () => Promise<{ default?: CesiumGlobal }>;
      const cesiumModule = await loadCesiumModule();
      const Cesium = (cesiumModule.default ?? window.Cesium) as CesiumGlobal | undefined;
      if (!Cesium) {
        reject(new Error('Cesium module loaded without a runtime export.'));
        return;
      }
      window.Cesium = Cesium;
      resolve(Cesium);
    } catch (error) {
      reject(
        error instanceof Error ? error : new Error('Failed to load the Cesium runtime module.')
      );
    }
  });

  return cesiumReadyPromise;
}

function toDegreesArrayHeights(path: LivePathPoint[]) {
  return path.flatMap((point) => [point.lon, point.lat, point.altKm * 1000]);
}

export default function GlobeScene({ points, tracks, livePath, focus, observer }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const sliced = useMemo(() => points.slice(0, 500), [points]);

  useEffect(() => {
    let disposed = false;

    void ensureCesium()
      .then((Cesium) => {
        if (disposed || !containerRef.current || viewerRef.current) return;

        const ionToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
        if (ionToken) Cesium.Ion.defaultAccessToken = ionToken;

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

        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            maximumLevel: 19,
          })
        );

        viewerRef.current = viewer;
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Failed to load Cesium.');
      });

    return () => {
      disposed = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;

    viewer.entities.removeAll();

    for (const point of sliced) {
      viewer.entities.add({
        id: `sat-${point.id}`,
        name: `NORAD ${point.id}`,
        position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.altKm * 1000),
        point: {
          pixelSize: 4,
          color: Cesium.Color.CYAN.withAlpha(0.75),
        },
      });
    }

    for (const track of tracks ?? []) {
      if (track.positions.length < 2) continue;
      viewer.entities.add({
        id: `track-${track.id}`,
        name: track.id,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(toDegreesArrayHeights(track.positions)),
          width: track.width ?? 1.5,
          material: Cesium.Color.fromCssColorString(track.color ?? '#22d3ee').withAlpha(0.65),
        },
      });
    }

    if (livePath && livePath.length > 1) {
      viewer.entities.add({
        id: 'live-path',
        name: 'N2YO live path',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(toDegreesArrayHeights(livePath)),
          width: 2,
          material: Cesium.Color.HOTPINK,
        },
      });
    }

    if (focus) {
      viewer.entities.add({
        id: 'focus-satellite',
        name: 'Focus',
        position: Cesium.Cartesian3.fromDegrees(focus.lon, focus.lat, focus.altKm * 1000),
        point: {
          pixelSize: 12,
          color: Cesium.Color.ORANGE,
        },
      });
    }

    if (observer) {
      viewer.entities.add({
        id: `observer-${observer.id}`,
        name: observer.label,
        position: Cesium.Cartesian3.fromDegrees(observer.lon, observer.lat, 0),
        point: {
          pixelSize: 10,
          color: Cesium.Color.WHITE,
        },
        label: {
          text: observer.label,
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.BLACK.withAlpha(0.65),
          pixelOffset: new Cesium.Cartesian2(0, -20),
          scale: 0.55,
        },
      });
    }
  }, [focus, livePath, observer, sliced, tracks]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium || !focus) return;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(focus.lon, focus.lat, Math.max(focus.altKm * 2500, 1_500_000)),
      duration: 1.4,
    });
  }, [focus]);

  return (
    <div className="relative h-[72vh] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <div ref={containerRef} className="h-full w-full" />
      {loadError ? (
        <div className="absolute inset-x-4 top-4 rounded-xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
          {loadError}
        </div>
      ) : null}
    </div>
  );
}
