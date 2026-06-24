'use client';

/**
 * DynamicBanner — replaces a page's hardcoded hero subtitle with a
 * data-driven paragraph generated from the live window.
 *
 * Flow:
 *   1. GET /api/v1/insights/banner/{page}?date_from=&date_to=
 *   2. Backend computes real metrics for the window and produces
 *      { headline, subtitle, tone, stats[], source } — the subtitle
 *      cites live AED / % / counts from the warehouse.
 *   3. Optionally (polish=true) Claude rewrites the subtitle in the
 *      page's voice. When it fails, we fall back silently to the
 *      template subtitle — the numbers remain truthful.
 *
 * Use:
 *   <DynamicBanner
 *     page="loyalty"
 *     filters={windowFilters}
 *     kicker="Loyalty vs Non-Loyalty"
 *     fallbackHeadline="How much incremental revenue does Nexus generate?"
 *     fallbackSubtitle="Hero subtitle while the first fetch is in flight"
 *   />
 */

import { useQuery } from '@tanstack/react-query';
import { Crown, RefreshCw, Sparkles } from 'lucide-react';
import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { BannerTone, FiltersState } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  page: string;
  filters?: FiltersState;
  /** Optional context label shown in gold above the headline. */
  kicker?: string;
  /** Headline shown while the first fetch is loading. */
  fallbackHeadline: string;
  /** Subtitle shown while the first fetch is loading. */
  fallbackSubtitle: string;
  /** Request the Claude-polished subtitle. Costs 1-4s on first load; cached 2 min. */
  polish?: boolean;
  /** Render on the dark hero (loyalty) vs a light card (other pages). */
  variant?: 'hero' | 'light';
}

const TONE_CLASS: Record<BannerTone, string> = {
  positive: 'text-emerald-300',
  negative: 'text-rose-200',
  neutral: 'text-[#F9C349]',
};

const LIGHT_TONE_CLASS: Record<BannerTone, string> = {
  positive: 'text-emerald-700',
  negative: 'text-rose-700',
  neutral: 'text-[#B4820E]',
};

const STAT_TONE_CLASS: Record<BannerTone, string> = {
  positive: 'border-emerald-400/40 bg-emerald-50/10 text-emerald-100',
  negative: 'border-rose-400/40 bg-rose-50/10 text-rose-100',
  neutral: 'border-[#F9C349]/30 bg-[#F9C349]/10 text-[#F9C349]',
};

const LIGHT_STAT_TONE_CLASS: Record<BannerTone, string> = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  negative: 'border-rose-200 bg-rose-50 text-rose-700',
  neutral: 'border-[#F9C349]/40 bg-[#FDF5E0] text-[#6F4D0A]',
};

export function DynamicBanner({
  page,
  filters,
  kicker,
  fallbackHeadline,
  fallbackSubtitle,
  polish = false,
  variant = 'hero',
}: Props) {
  const { data, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['banner', page, filters?.date_from, filters?.date_to, polish],
    queryFn: () => api.banner(page, filters ?? {}, { polish }),
    // The banner is derived from the same window the tiles read — keep it
    // warm for a couple of minutes so pagination / tab switches don't
    // re-fetch unnecessarily.
    staleTime: 120_000,
  });

  const generatedLabel = useMemo(() => {
    if (!dataUpdatedAt) return 'generating…';
    const diffMin = Math.round((Date.now() - dataUpdatedAt) / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin === 1) return '1 min ago';
    if (diffMin < 60) return `${diffMin} min ago`;
    const h = Math.round(diffMin / 60);
    return `${h}h ago`;
  }, [dataUpdatedAt]);

  const headline = data?.headline || fallbackHeadline;
  const subtitle = data?.subtitle || fallbackSubtitle;
  const tone: BannerTone = data?.tone ?? 'neutral';
  const stats = data?.stats ?? [];
  const source = data?.source ?? 'template';

  if (variant === 'hero') {
    return (
      <section className="nexus-hero relative overflow-hidden rounded-2xl border border-[#1A1D33] bg-nexus-navy p-6 text-white shadow-pop md:p-10">
        <div className="relative z-10 max-w-3xl space-y-4">
          {kicker ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
              <Crown size={14} /> {kicker}
            </span>
          ) : null}
          <h1
            className={cn(
              'font-display text-3xl font-bold tracking-tight text-balance md:text-[42px] md:leading-[1.05]',
              TONE_CLASS[tone],
            )}
          >
            {headline}
          </h1>
          <p className="max-w-2xl text-[15px] text-white/85 md:text-base">{subtitle}</p>

          {stats.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {stats.map((s) => (
                <span
                  key={s.label}
                  className={cn(
                    'inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                    STAT_TONE_CLASS[s.tone],
                  )}
                >
                  <span className="opacity-70">{s.label}</span>
                  <span className="font-semibold tabular-nums">{s.value}</span>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge
              variant="outline"
              className="border-white/20 bg-white/5 text-[10px] text-white/70"
            >
              <Sparkles className="h-3 w-3" aria-hidden /> {source === 'claude' ? 'AI-written' : 'auto'} · {generatedLabel}
            </Badge>
            {data?.window_label ? (
              <Badge
                variant="outline"
                className="border-white/20 bg-white/5 text-[10px] text-white/70"
              >
                window · {data.window_label}
              </Badge>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 border-white/20 bg-white/5 text-[11px] text-white/85 hover:bg-white/10"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Regenerate banner"
            >
              <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} /> Regenerate
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // Light variant — drop-in under `<header>` on non-hero pages.
  return (
    <section className="rounded-xl border border-[#F9C349]/40 bg-gradient-to-br from-white to-[#FDF5E0]/50 p-4 shadow-tile">
      <div className="space-y-2">
        {kicker ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B4820E]">
            {kicker}
          </p>
        ) : null}
        <h2
          className={cn(
            'font-display text-xl font-semibold md:text-2xl text-balance',
            LIGHT_TONE_CLASS[tone],
          )}
        >
          {headline}
        </h2>
        <p className="text-sm text-muted-foreground md:text-[15px]">{subtitle}</p>

        {stats.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {stats.map((s) => (
              <span
                key={s.label}
                className={cn(
                  'inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                  LIGHT_STAT_TONE_CLASS[s.tone],
                )}
              >
                <span className="opacity-70">{s.label}</span>
                <span className="font-semibold tabular-nums">{s.value}</span>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant="outline" className="text-[10px]">
            <Sparkles className="h-3 w-3" aria-hidden /> {source === 'claude' ? 'AI-written' : 'auto'} · {generatedLabel}
          </Badge>
          {data?.window_label ? (
            <Badge variant="outline" className="text-[10px]">
              window · {data.window_label}
            </Badge>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} /> Regenerate
          </Button>
        </div>
      </div>
    </section>
  );
}
