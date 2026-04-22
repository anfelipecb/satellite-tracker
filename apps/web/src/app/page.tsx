import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <p className="text-sm uppercase tracking-[0.3em] text-aurora">Design · Build · Ship</p>
      <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
        Satellite Tracker
      </h1>
      <p className="text-lg text-slate-400">
        Multi-service system: CelesTrak + N2YO → Railway worker → Supabase Realtime → this
        Next.js globe. Sign in to save locations, track favorites, and watch live passes.
      </p>
      <div className="flex flex-wrap gap-4">
        <SignedOut>
          <SignInButton mode="modal">
            <button className="rounded-full bg-aurora px-6 py-3 text-sm font-medium text-void hover:opacity-90">
              Sign in to launch
            </button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <Link
            href="/app"
            className="rounded-full bg-aurora px-6 py-3 text-sm font-medium text-void hover:opacity-90"
          >
            Open dashboard
          </Link>
        </SignedIn>
      </div>
    </main>
  );
}
