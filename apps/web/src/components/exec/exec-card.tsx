'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

import { NexusMark } from '@/components/brand/nexus-logo';
import { cn } from '@/lib/utils';

type Tone = 'positive' | 'negative' | 'neutral' | 'warning';

export interface ExecCardProps {
  kicker: string;          // "01 · Today's pulse"
  title: string;           // card headline
  bigNumber: string;       // the one number
  bigSubtext?: string;     // AED / %
  deltaText?: string;      // "+12% vs yesterday"
  sentence: string;        // plain-english takeaway
  why?: string;            // audit trail / data source
  actionLabel?: string;    // CTA button
  actionHref?: string;     // CTA target
  spark?: { x: string; y: number }[];
  tone?: Tone;
  indexLabel?: string;     // "3 / 7"
  /**
   * Optional richer content — mini KPI strip, table, chart — rendered below the
   * hero number. Keeps single-focus framing (one card, one story) while allowing
   * each slide to carry the same data density as the equivalent dashboard row.
   */
  extra?: ReactNode;
  /** Hide the big-number hero when a slide is chart-dominant (e.g. revenue trend). */
  heroless?: boolean;
}

const toneTokens: Record<Tone, { accent: string; glow: string; badge: string; spark: string }> = {
  positive: {
    accent: 'text-emerald-600',
    glow: 'radial-gradient(closest-side, rgba(16,185,129,0.45), transparent 70%)',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    spark: '#10B981',
  },
  negative: {
    accent: 'text-[#C84C2A]',
    glow: 'radial-gradient(closest-side, rgba(242,113,76,0.45), transparent 70%)',
    badge: 'bg-[#FFE7DD] text-[#C84C2A] ring-[#F2714C]/30',
    spark: '#F2714C',
  },
  warning: {
    accent: 'text-[#B4820E]',
    glow: 'radial-gradient(closest-side, rgba(249,195,73,0.6), transparent 70%)',
    badge: 'bg-[#FDF5E0] text-[#B4820E] ring-[#F9C349]/40',
    spark: '#DA9712',
  },
  neutral: {
    accent: 'text-[#B4820E]',
    glow: 'radial-gradient(closest-side, rgba(249,195,73,0.55), transparent 70%)',
    badge: 'bg-[#FDF5E0] text-[#B4820E] ring-[#F9C349]/40',
    spark: '#F9C349',
  },
};

/**
 * The canonical Nexus exec card grammar (Tableau Pulse + Stephen Few):
 *   one big number · one plain-English sentence · one recommended action.
 *
 * Card occupies the full viewport minus header. Fits at 1280×720 and scales up.
 */
export function ExecCard({
  kicker,
  title,
  bigNumber,
  bigSubtext,
  deltaText,
  sentence,
  why,
  actionLabel,
  actionHref,
  spark,
  tone = 'neutral',
  indexLabel,
  extra,
  heroless,
}: ExecCardProps) {
  const tokens = toneTokens[tone];
  const dense = Boolean(extra); // denser layout when rich content is injected
  return (
    <article
      className="relative flex h-full w-full shrink-0 snap-center flex-col overflow-hidden rounded-3xl border border-[#E8E5DC] bg-surface p-5 md:p-8"
      role="group"
      aria-roledescription="slide"
      aria-label={indexLabel ? `Card ${indexLabel}: ${title}` : title}
    >
      {/* Decorative glow is kept ONLY on hero-dominant slides where there's
          no injected extra content — it was causing text bleed on dense slides. */}
      {!dense ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-[280px] w-[280px] rounded-full opacity-50"
          style={{ background: tokens.glow, filter: 'blur(6px)' }}
        />
      ) : null}

      <header className="relative z-10 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <NexusMark size={14} />
          {kicker}
        </span>
        {indexLabel ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {indexLabel}
          </span>
        ) : null}
      </header>

      <div
        className={cn(
          'relative z-10 mt-4 flex min-h-0 flex-1 flex-col overflow-auto',
          dense ? 'gap-3' : 'gap-5',
        )}
      >
        <h2
          className={cn(
            'max-w-3xl font-display font-semibold text-foreground',
            dense ? 'text-[18px] md:text-[22px]' : 'text-[22px] md:text-[30px]',
          )}
        >
          {title}
        </h2>

        {!heroless ? (
          <div className="flex flex-wrap items-end gap-5">
            <div>
              <p
                className={cn(
                  'font-display font-bold leading-none tracking-tight text-foreground',
                  dense ? 'text-[44px] md:text-[56px]' : 'text-[64px] md:text-[96px]',
                  tokens.accent,
                )}
              >
                {bigNumber}
                {bigSubtext ? (
                  <span
                    className={cn(
                      'ml-3 align-middle font-semibold text-muted-foreground',
                      dense ? 'text-[16px] md:text-[20px]' : 'text-[20px] md:text-[26px]',
                    )}
                  >
                    {bigSubtext}
                  </span>
                ) : null}
              </p>
              {deltaText ? (
                <p
                  className={cn(
                    'mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ring-1',
                    tokens.badge,
                  )}
                >
                  {deltaText}
                </p>
              ) : null}
            </div>

            {spark && spark.length > 1 ? (
              <div
                className={cn(
                  'shrink-0',
                  dense ? 'h-14 w-48 md:h-16 md:w-56' : 'h-16 w-56 md:h-20 md:w-64',
                )}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={spark} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <defs>
                      <linearGradient
                        id={`exec-spark-${kicker.replace(/\W/g, '')}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={tokens.spark} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={tokens.spark} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="y"
                      stroke={tokens.spark}
                      strokeWidth={2.5}
                      fill={`url(#exec-spark-${kicker.replace(/\W/g, '')})`}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </div>
        ) : null}

        {extra ? <div className="min-h-0 shrink-0">{extra}</div> : null}

        <p
          className={cn(
            'max-w-3xl leading-relaxed text-foreground/90',
            dense ? 'text-sm md:text-base' : 'text-base md:text-lg',
          )}
        >
          {sentence}
        </p>

        {why ? (
          <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-[#DA9712]" aria-hidden />
            {why}
          </p>
        ) : null}

        {actionLabel && actionHref ? (
          <Link
            href={actionHref}
            className="mt-1 inline-flex w-max items-center gap-2 rounded-full bg-[#F9C349] px-4 py-2 text-sm font-semibold text-[#0F1120] shadow-[0_10px_28px_rgba(249,195,73,0.45)] transition hover:bg-[#fbd06a]"
          >
            {actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <footer className="relative z-10 mt-4 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span>Nexus Partner Analytics</span>
        <span className="font-mono">← → to navigate</span>
      </footer>
    </article>
  );
}
