'use client';

/**
 * Global "AI is filtering this page" strip. Sits under the top bar and shows
 * which filters the copilot applied via URL params (`?ai_*`). Gives the demo
 * its visible magic moment: user types "gold members balance > 2000" in the
 * copilot, clicks Apply — and *this* strip pops up on the target page.
 */

import { Sparkles, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { filtersToChips, hasAnyAiFilter, parseFiltersFromSearch } from './intent-parser';

export function AiFilterStrip() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => parseFiltersFromSearch(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const clear = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    [
      'ai_tier',
      'ai_min_balance',
      'ai_max_balance',
      'ai_no_activity_days',
      'ai_min_clv',
      'ai_action',
    ].forEach((k) => next.delete(k));
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [pathname, router, searchParams]);

  if (!hasAnyAiFilter(filters)) return null;

  const chips = filtersToChips(filters);

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-30 border-b border-primary/30 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 px-4 py-2 md:px-6"
    >
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          AI filter applied
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded-full border border-primary/40 bg-background px-2 py-0.5 text-[11px] font-medium text-foreground"
            >
              {c}
            </span>
          ))}
        </span>
        <button
          type="button"
          onClick={clear}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
          aria-label="Clear AI filter"
        >
          <X className="h-3 w-3" aria-hidden />
          Clear filter
        </button>
      </div>
    </div>
  );
}
