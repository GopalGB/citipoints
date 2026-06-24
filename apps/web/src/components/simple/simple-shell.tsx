'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense, useCallback } from 'react';

import { PartnerSwitcher } from '@/components/shell/partner-switcher';

// ─────────────────────────────────────────────────────────────────────────
// SimpleShell — old-school chrome for the 4 dial-down pages.
// Per Arjit's coaching call (2026-04-26): hide the over-complicated 30-page
// Pro suite, give the Nexus CXO a Tableau-genre 4-page experience with
// shared filters (period, market, tier). Pro view at /executive remains
// reachable via the footer link.
// ─────────────────────────────────────────────────────────────────────────

export const SIMPLE_ROUTES = ['/', '/customers', '/partners', '/outlook'] as const;

const NAV_LINKS = [
  { href: '/', label: 'Executive' },
  { href: '/customers', label: 'Customers' },
  { href: '/partners', label: 'Partners' },
  { href: '/outlook', label: 'Outlook' },
];

const PERIOD_OPTIONS = [
  { value: 'this-week', label: 'This week' },
  { value: 'this-month', label: 'This month' },
  { value: 'this-quarter', label: 'This quarter' },
  { value: 'last-quarter', label: 'Last quarter' },
  { value: 'ytd', label: 'YTD' },
  { value: 'last-30', label: 'Last 30 days' },
  { value: 'last-365', label: 'Last 365 days' },
];

const MARKET_OPTIONS = [
  { value: 'all', label: 'All markets' },
  { value: 'uae', label: 'UAE' },
  { value: 'bahrain', label: 'Bahrain' },
];

const TIER_OPTIONS = [
  { value: 'all', label: 'All tiers' },
  { value: 'platinum', label: 'Platinum' },
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'bronze', label: 'Bronze' },
];

export const PERIOD_LABEL: Record<string, string> = Object.fromEntries(
  PERIOD_OPTIONS.map((o) => [o.value, o.label]),
);

export const MARKET_LABEL: Record<string, string> = Object.fromEntries(
  MARKET_OPTIONS.map((o) => [o.value, o.label]),
);

export function SimpleShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#1F1F1F]">
      <Suspense
        fallback={
          <div className="h-[120px] border-b border-[#E5E5E5] bg-white" />
        }
      >
        <SimpleShellTop />
      </Suspense>
      <Suspense
        fallback={
          <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-6 md:px-10">
            <div className="h-40 animate-pulse bg-[#FAFAFA]" />
          </main>
        }
      >
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-6 md:px-10">
          {children}
        </main>
      </Suspense>
      <footer className="mx-auto mt-8 flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-2 border-t border-[#E5E5E5] px-6 py-4 text-[11px] text-[#888] md:px-10">
        <div>
          City Points Loyalty Card Services LLC · Nexus®{' '}
          {new Date().getFullYear()}
        </div>
        <Link
          href="/executive"
          className="text-[#14213D] underline-offset-2 hover:underline"
        >
          Pro view — full analytics suite (30 pages, ML, agents) →
        </Link>
      </footer>
    </div>
  );
}

function SimpleShellTop() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();

  const period = params.get('period') ?? 'this-quarter';
  const market = params.get('market') ?? 'all';
  const tier = params.get('tier') ?? 'all';

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (
        !value ||
        (key !== 'period' && value === 'all') ||
        (key === 'period' && value === 'this-quarter')
      ) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, params],
  );

  const reset = () => router.push(pathname);

  const isFiltered =
    (params.get('period') && params.get('period') !== 'this-quarter') ||
    market !== 'all' ||
    tier !== 'all';

  return (
    <div className="border-b border-[#E5E5E5] bg-white">
      {/* ───── Brand row ───── */}
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-6 py-3 md:px-10">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-[20px] font-bold tracking-tight text-[#14213D]">
            Nexus
          </span>
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-[#888] sm:inline">
            Partner Analytics · Powered by CITI Points
          </span>
        </div>
        <div className="flex items-center gap-3">
          <PartnerSwitcher />
        </div>
      </div>

      {/* ───── Page nav ───── */}
      <nav className="mx-auto flex max-w-[1280px] items-end gap-0 overflow-x-auto border-t border-[#F0F0F0] px-6 md:px-10">
        {NAV_LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={
                'border-b-2 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.10em] transition ' +
                (active
                  ? 'border-[#14213D] text-[#14213D]'
                  : 'border-transparent text-[#888] hover:text-[#1F1F1F]')
              }
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      {/* ───── Filter bar ───── */}
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 border-t border-[#F0F0F0] bg-[#FAFAFA] px-6 py-2 md:px-10">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#888]">
          Filters:
        </span>
        <FilterSelect
          label="Period"
          value={period}
          options={PERIOD_OPTIONS}
          onChange={(v) => setParam('period', v)}
        />
        <FilterSelect
          label="Market"
          value={market}
          options={MARKET_OPTIONS}
          onChange={(v) => setParam('market', v)}
        />
        <FilterSelect
          label="Tier"
          value={tier}
          options={TIER_OPTIONS}
          onChange={(v) => setParam('tier', v)}
        />
        {isFiltered ? (
          <button
            type="button"
            onClick={reset}
            className="ml-2 text-[11px] text-[#14213D] underline-offset-2 hover:underline"
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-[#1F1F1F]">
      <span className="text-[#666]">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-[#DDDDDD] bg-white px-2 py-1 text-[12px] text-[#1F1F1F] focus:border-[#14213D] focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function useSimpleFilters() {
  const params = useSearchParams();
  return {
    period: params.get('period') ?? 'this-quarter',
    market: params.get('market') ?? 'all',
    tier: params.get('tier') ?? 'all',
  };
}
