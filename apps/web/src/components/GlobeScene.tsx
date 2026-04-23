'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

export type GlobePointKind = 'background' | 'favorite' | 'focus';

export type GlobePoint = {
  id: number;
  name?: string;
  lat: number;
  lon: number;
  altKm: number;
  kind?: GlobePointKind;
};

export type LivePathPoint = { lat: number; lon: number; altKm: number };

export type OrbitTrack = {
  id: string;
  noradId?: number;
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

export type GlobeSceneHandle = {
  focusOnSatellite: (noradId: number) => void;
  resetView: () => void;
};

type Props = {
  points: GlobePoint[];
  tracks?: OrbitTrack[];
  livePath?: LivePathPoint[] | null;
  observer?: ObserverPoint | null;
  /** When true, show NORAD labels on background points (default false). */
  showLabels?: boolean;
  onPointClick?: (noradId: number) => void;
  /** 2D mode for tiles view */
  sceneMode2D?: boolean;
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
    ORANGE: { withAlpha: (value: number) => unknown };
    WHITE: unknown;
    BLACK: { withAlpha: (value: number) => unknown };
    fromCssColorString: (value: string) => { withAlpha: (alpha: number) => unknown };
  };
  Ion: { defaultAccessToken?: string };
  ScreenSpaceEventHandler: new (element: HTMLCanvasElement) => CesiumHandler;
  ScreenSpaceEventType: { LEFT_CLICK: number };
  defined: (value: unknown) => boolean;
  SceneMode: { SCENE2D: number; SCENE3D: number };
};

type CesiumHandler = {
  setInputAction: (cb: (click: { position: unknown }) => void, type: number) => void;
  destroy: () => void;
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
  scene: {
    mode: number;
    canvas: HTMLCanvasElement;
    pick: (pos: unknown) => { id?: { id: string } } | undefined;
  };
  destroy: () => void;
};

declare global {
  interface Window {
    Cesium?: CesiumGlobal;
  }
}

let cesiumReadyPromise: Promise<CesiumGlobal> | null = null;

function getCesiumRuntime() {
  if (typeof window === 'undefined') return undefined;
  const runtime = window.Cesium ?? (globalThis as typeof window).Cesium;
  if (runtime) window.Cesium = runtime;
  return runtime;
}

function ensureCesium() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Cesium is only available in the browser.'));
  }

  const existingRuntime = getCesiumRuntime();
  if (existingRuntime) {
    window.Cesium = existingRuntime;
    return Promise.resolve(existingRuntime);
  }
  if (cesiumReadyPromise) return cesiumReadyPromise;

  cesiumReadyPromise = new Promise((resolve, reject) => {
    const cssId = 'cesium-widgets-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = '/cesium/Widgets/widgets.css';
      document.head.appendChild(link);
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-cesium-script="true"]');
    if (existing) {
      existing.addEventListener('load', () => {
        const Cesium = getCesiumRuntime();
        if (!Cesium) {
          reject(new Error('Cesium script loaded without a browser runtime.'));
          return;
        }
        window.Cesium = Cesium;
        resolve(Cesium);
      });
      existing.addEventListener('error', () => reject(new Error('Failed to load Cesium script.')));
      return;
    }

    const script = document.createElement('script');
    script.src = '/cesium/Cesium.js';
    script.async = true;
    script.dataset.cesiumScript = 'true';
    script.onload = () => {
      const Cesium = getCesiumRuntime();
      if (!Cesium) {
        reject(new Error('Cesium loaded without a browser runtime.'));
        return;
      }
      window.Cesium = Cesium;
      resolve(Cesium);
    };
    script.onerror = () => reject(new Error('Failed to load Cesium browser bundle.'));
    document.head.appendChild(script);
  });

  return cesiumReadyPromise;
}

function toDegreesArrayHeights(path: LivePathPoint[]) {
  return path.flatMap((point) => [point.lon, point.lat, point.altKm * 1000]);
}

const BILLBOARD_URI = '/icons/satellite.svg';

const GlobeScene = forwardRef<GlobeSceneHandle, Props>(function GlobeScene(
  { points, tracks, livePath, observer, showLabels = false, onPointClick, sceneMode2D = false },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const pointsRef = useRef<GlobePoint[]>([]);
  const handlerRef = useRef<CesiumHandler | null>(null);
  const onPointClickRef = useRef<Props['onPointClick']>(onPointClick);
  onPointClickRef.current = onPointClick;
  const [loadError, setLoadError] = useState<string | null>(null);

  const sliced = useMemo(() => points.slice(0, 500), [points]);
  useEffect(() => {
    pointsRef.current = sliced;
  }, [sliced]);

  useImperativeHandle(
    ref,
    () => ({
      focusOnSatellite: (noradId: number) => {
        const viewer = viewerRef.current;
        const Cesium = window.Cesium;
        if (!viewer || !Cesium) return;
        const p = pointsRef.current.find((x) => x.id === noradId);
        if (!p) return;
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, Math.max(p.altKm * 2500, 1_500_000)),
          duration: 1.2,
        });
      },
      resetView: () => {
        const viewer = viewerRef.current;
        const Cesium = window.Cesium;
        if (!viewer || !Cesium) return;
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(-90, 25, 18_000_000),
          duration: 1.2,
        });
      },
    }),
    []
  );

  useEffect(() => {
    let disposed = false;
    const scene2d = sceneMode2D;

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
          sceneModePicker: !scene2d,
          navigationHelpButton: false,
          infoBox: false,
          selectionIndicator: false,
          fullscreenButton: false,
        });

        if (scene2d && Cesium.SceneMode) {
          viewer.scene.mode = Cesium.SceneMode.SCENE2D;
        }

        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            maximumLevel: 19,
          })
        );

        viewerRef.current = viewer;

        const h = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handlerRef.current = h;
        h.setInputAction(
          (click: { position: unknown }) => {
            const fn = onPointClickRef.current;
            if (!fn) return;
            const picked = viewer.scene.pick(click.position) as { id?: { id?: string } } | undefined;
            if (!Cesium.defined(picked) || !picked) return;
            const ent = (picked as { id?: { id?: string } }).id;
            const rawId = ent && typeof ent === 'object' && 'id' in ent && typeof ent.id === 'string' ? ent.id : undefined;
            const sid = rawId && rawId.startsWith('sat-') ? rawId.slice(4) : null;
            if (sid) {
              const n = Number(sid);
              if (!Number.isNaN(n)) fn(n);
            }
          },
          Cesium.ScreenSpaceEventType.LEFT_CLICK
        );
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Failed to load Cesium.');
      });

    return () => {
      disposed = true;
      handlerRef.current?.destroy();
      handlerRef.current = null;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [sceneMode2D]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;

    viewer.entities.removeAll();

    for (const point of sliced) {
      const kind = point.kind ?? 'background';
      const isFavorite = kind === 'favorite' || kind === 'focus';
      const scale = isFavorite ? 0.5 : 0.28;
      const tint = isFavorite
        ? Cesium.Color.ORANGE.withAlpha(0.95)
        : Cesium.Color.CYAN.withAlpha(0.88);
      const showLabel = isFavorite && (point.name || showLabels);
      viewer.entities.add({
        id: `sat-${point.id}`,
        name: point.name ? `${point.name}` : `NORAD ${point.id}`,
        position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.altKm * 1000),
        billboard: {
          image: BILLBOARD_URI,
          scale,
          color: tint,
          heightReference: 0, // none
        },
        label: showLabel
          ? {
              text: point.name ?? `NORAD ${point.id}`,
              font: '12px system-ui, sans-serif',
              fillColor: Cesium.Color.WHITE,
              showBackground: true,
              backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
              pixelOffset: new Cesium.Cartesian2(0, -32),
              scale: 0.6,
            }
          : { show: false },
      });
    }

    for (const track of tracks ?? []) {
      if (track.positions.length < 2) continue;
      const safeId = String(track.noradId ?? track.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      viewer.entities.add({
        id: `track-${safeId}`,
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
  }, [livePath, observer, showLabels, sliced, tracks]);

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
});

export default GlobeScene;
