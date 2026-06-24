import { ArrowRight, Home } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <div className="space-y-2">
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">
          404 · page not found
        </p>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          That route isn&apos;t on the coalition map.
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The page you followed was renamed, retired, or never shipped. Try the
          Overview or ask Nexus AI to jump you to the right dashboard.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#F9C349] px-4 py-2 text-sm font-semibold text-[#0F1120] shadow-[0_6px_16px_rgba(249,195,73,0.35)] transition hover:bg-[#fbd06a]"
        >
          <Home className="h-4 w-4" />
          Back to Overview
        </Link>
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          Ask Nexus AI
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
