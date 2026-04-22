'use client';

import { useEffect, useMemo } from 'react';
import { Viewer, Entity } from 'resium';
import * as Cesium from 'cesium';
import 'cesium/Source/Widgets/widgets.css';

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

function toCartesianPath(path: LivePathPoint[]) {
  return path.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altKm * 1000));
}

export default function GlobeScene({ points, tracks, livePath, focus, observer }: Props) {
  useEffect(() => {
    const t = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
    if (t) Cesium.Ion.defaultAccessToken = t;
  }, []);

  useEffect(() => {
    const viewer = (window as unknown as { __CESIUM_VIEWER?: Cesium.Viewer }).__CESIUM_VIEWER;
    if (!viewer) return;
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maximumLevel: 19,
      })
    );
  }, []);

  const pathPositions = useMemo(() => {
    if (!livePath?.length) return null;
    return toCartesianPath(livePath);
  }, [livePath]);

  const sliced = useMemo(() => points.slice(0, 500), [points]);
  const trackPositions = useMemo(
    () =>
      (tracks ?? []).map((track) => ({
        ...track,
        positions: toCartesianPath(track.positions),
      })),
    [tracks]
  );

  useEffect(() => {
    const viewer = (window as unknown as { __CESIUM_VIEWER?: Cesium.Viewer }).__CESIUM_VIEWER;
    if (!viewer || !focus) return;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(focus.lon, focus.lat, Math.max(focus.altKm * 2500, 1_500_000)),
      duration: 1.4,
    });
  }, [focus]);

  return (
    <div className="h-[72vh] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <Viewer
        ref={(v) => {
          (window as unknown as { __CESIUM_VIEWER?: Cesium.Viewer }).__CESIUM_VIEWER = v?.cesiumElement;
        }}
        full
        timeline={false}
        animation={false}
        baseLayerPicker={false}
        geocoder={false}
      >
        {sliced.map((p) => (
          <Entity
            key={p.id}
            name={`NORAD ${p.id}`}
            position={Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altKm * 1000)}
            point={{
              pixelSize: 3,
              color: Cesium.Color.CYAN.withAlpha(0.75),
            }}
          />
        ))}
        {trackPositions.map((track) =>
          track.positions.length > 1 ? (
            <Entity
              key={track.id}
              name={track.id}
              polyline={{
                positions: track.positions,
                width: track.width ?? 1.5,
                material: Cesium.Color.fromCssColorString(track.color ?? '#22d3ee').withAlpha(0.65),
              }}
            />
          ) : null
        )}
        {pathPositions && pathPositions.length > 1 ? (
          <Entity
            name="N2YO live path"
            polyline={{
              positions: pathPositions,
              width: 2,
              material: Cesium.Color.HOTPINK,
            }}
          />
        ) : null}
        {focus ? (
          <Entity
            name="Focus"
            position={Cesium.Cartesian3.fromDegrees(focus.lon, focus.lat, focus.altKm * 1000)}
            point={{ pixelSize: 12, color: Cesium.Color.ORANGE }}
          />
        ) : null}
        {observer ? (
          <Entity
            name={observer.label}
            position={Cesium.Cartesian3.fromDegrees(observer.lon, observer.lat, 0)}
            point={{ pixelSize: 10, color: Cesium.Color.WHITE }}
            label={{
              text: observer.label,
              fillColor: Cesium.Color.WHITE,
              showBackground: true,
              backgroundColor: Cesium.Color.BLACK.withAlpha(0.6),
              pixelOffset: new Cesium.Cartesian2(0, -20),
              scale: 0.55,
            }}
          />
        ) : null}
      </Viewer>
    </div>
  );
}
