import { TilesClient } from '@/components/TilesClient';

export default function TilesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Data availability tiles</h1>
        <p className="mt-1 text-slate-400">NASA CMR + H3 overlay, live Realtime, with predicted pass tint.</p>
      </div>
      <TilesClient />
    </div>
  );
}
