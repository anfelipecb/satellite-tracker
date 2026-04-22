import { DashboardClient } from '@/components/DashboardClient';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Mission Control</h1>
        <p className="max-w-3xl text-sm text-slate-300">
          One screen for the three core features: a living 3D globe, a live overhead counter for saved
          observer locations, and favorites-based satellite tracking with predicted and N2YO-backed paths.
        </p>
      </div>
      <DashboardClient />
    </div>
  );
}
