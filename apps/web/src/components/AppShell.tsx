import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

const links = [
  { href: '/app', label: 'Dashboard' },
  { href: '/app/globe', label: 'Globe' },
  { href: '/app/locations', label: 'Locations' },
  { href: '/app/satellites', label: 'Satellites' },
  { href: '/app/tiles', label: 'Tiles (beta)' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Link href="/app" className="text-sm font-semibold tracking-tight text-white">
            Satellite Tracker
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-aurora">
                {l.label}
              </Link>
            ))}
            <UserButton afterSignOutUrl="/" />
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
