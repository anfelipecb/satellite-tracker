import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

const links = [
  { href: '/app', label: 'Mission Control' },
  { href: '/app/globe', label: 'Globe Lab' },
  { href: '/app/locations', label: 'Locations' },
  { href: '/app/satellites', label: 'Tracking' },
  { href: '/app/tiles', label: 'Tiles (beta)' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#0f2033_0%,#070a12_42%,#020305_100%)]">
      <header className="border-b border-white/10 bg-slate-950/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link href="/app" className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-xs font-semibold text-cyan-100">
              ST
            </span>
            <span className="text-sm font-semibold tracking-[0.2em] text-white">SATELLITE TRACKER</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-full border border-white/10 px-3 py-1.5 transition hover:border-cyan-400/30 hover:text-cyan-200"
              >
                {l.label}
              </Link>
            ))}
            <UserButton afterSignOutUrl="/" />
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8">{children}</div>
    </div>
  );
}
