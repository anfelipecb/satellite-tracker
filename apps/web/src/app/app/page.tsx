import { DashboardClient } from '@/components/DashboardClient';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400">
          Live tiles fed by Supabase Realtime when the Railway worker updates space weather, launches, or
          overhead counts.
        </p>
      </div>
      <DashboardClient />
    </div>
  );
}
