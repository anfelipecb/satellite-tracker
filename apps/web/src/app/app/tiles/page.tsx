import Link from 'next/link';

export default function TilesPage() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1 className="text-2xl font-semibold text-white">Data availability tiles (beta)</h1>
      <p className="text-slate-400">
        Stretch milestone: Cesium 2D map + H3 hex overlay, NASA CMR granule footprints for Landsat / MODIS /
        Sentinel, and TLE-predicted future passes. The worker includes a <code className="text-aurora">cmrIngest</code>{' '}
        stub — enable CMR + <code className="text-aurora">h3-js</code> in a follow-up PR.
      </p>
      <p>
        <Link href="/app/globe" className="text-aurora hover:underline">
          Open the 3D globe
        </Link>{' '}
        for the shipping MVP.
      </p>
    </div>
  );
}
