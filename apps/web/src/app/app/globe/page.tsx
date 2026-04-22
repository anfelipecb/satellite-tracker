import { GlobePageClient } from '@/components/GlobePageClient';

export default function GlobePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Globe Lab</h1>
        <p className="max-w-3xl text-sm text-slate-300">
          Standalone globe sandbox for dense orbital visualization. Use it when you want a lighter view than
          the full mission-control dashboard.
        </p>
      </div>
      <GlobePageClient />
    </div>
  );
}
