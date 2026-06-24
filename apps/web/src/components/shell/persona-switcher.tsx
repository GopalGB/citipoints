'use client';

import { BarChart3, Crown, Microscope } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

type Persona = 'exec' | 'ops' | 'analyst';

const PERSONAS: {
  id: Persona;
  label: string;
  icon: typeof Crown;
  hint: string;
  href: string;
}[] = [
  { id: 'exec', label: 'Exec', icon: Crown, hint: 'Swipe-first briefing · 7 cards', href: '/executive' },
  { id: 'ops', label: 'Ops', icon: BarChart3, hint: 'Full dashboards · drill + filter', href: '/overview' },
  { id: 'analyst', label: 'Analyst', icon: Microscope, hint: 'Deep · SQL · exports', href: '/analyst' },
];

const STORAGE_KEY = 'nexus:persona';

/**
 * Three-way persona toggle mirrors Tableau Audiences + Looker tiered roles.
 * Same warehouse, same metrics, three shells. Persists pick in localStorage.
 */
export function PersonaSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState<Persona>('ops');

  useEffect(() => {
    // Derive active persona from current pathname first, fall back to storage.
    let derived: Persona = 'ops';
    if (pathname?.startsWith('/executive')) derived = 'exec';
    else if (pathname?.startsWith('/analyst')) derived = 'analyst';
    else if (pathname?.startsWith('/overview')) derived = 'ops';
    setActive(derived);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, derived);
    }
  }, [pathname]);

  const pick = useCallback(
    (id: Persona, href: string) => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, id);
      }
      setActive(id);
      router.push(href);
    },
    [router],
  );

  return (
    <div
      role="tablist"
      aria-label="Dashboard persona"
      className="hidden items-center gap-0.5 rounded-full border border-white/15 bg-white/5 p-0.5 md:inline-flex"
    >
      {PERSONAS.map((p) => {
        const Icon = p.icon;
        const chosen = p.id === active;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={chosen}
            onClick={() => pick(p.id, p.href)}
            title={p.hint}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition',
              chosen
                ? 'bg-[#F9C349] text-[#0F1120] shadow-[0_2px_10px_rgba(249,195,73,0.35)]'
                : 'text-white/75 hover:bg-white/10 hover:text-white',
            )}
          >
            <Icon className="h-3 w-3" aria-hidden />
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
