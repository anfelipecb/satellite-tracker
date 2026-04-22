'use client';

import { useEffect, useMemo } from 'react';
import { Viewer, Entity } from 'resium';
import * as Cesium from 'cesium';
import 'cesium/Source/Widgets/widgets.css';

export type GlobePoint = { id: number; lat: number; lon: number; altKm: number };

export type LivePathPoint = { lat: number; lon: number; altKm: number };

type Props = {
  points: GlobePoint[];
  livePath?: LivePathPoint[] | null;
  focus?: { lat: number; lon: number; altKm: number } | null;
};

export default function GlobeScene({ points, livePath, focus }: Props) {
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
    return livePath.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altKm * 1000));
  }, [livePath]);

  const sliced = useMemo(() => points.slice(0, 500), [points]);

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
      </Viewer>
    </div>
  );
}
