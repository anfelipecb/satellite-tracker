import { GlobePageClient } from '@/components/GlobePageClient';

export default function GlobePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">3D globe</h1>
        <p className="text-sm text-slate-400">
          Cesium + SGP4 propagation. Use N2YO for a live 300-second track over your location.
        </p>
      </div>
      <GlobePageClient />
    </div>
  );
}
