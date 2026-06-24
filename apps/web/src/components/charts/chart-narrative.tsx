'use client';

import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

type Tone = 'positive' | 'negative' | 'neutral' | 'info';

interface Props {
  /** 2-4 sentence plain-English takeaway under the chart. */
  text: string;
  /** Optional bold delta phrase highlighted in gold. */
  delta?: string;
  /** Optional "why this matters" one-liner shown in muted type. */
  why?: string;
  tone?: Tone;
  className?: string;
}

/**
 * Hex Magic / ThoughtSpot SpotIQ pattern — one-sentence AI narrative under
 * every chart, bold the delta, give the reader a "why" sentence.
 *
 * [Hex Magic](https://hex.tech/product/magic-ai/) -
 * [ThoughtSpot SpotIQ](https://docs.thoughtspot.com/cloud/latest/spotiq-introduction) -
 * [Tableau Pulse](https://www.tableau.com/products/tableau-pulse)
 */
export function ChartNarrative({ text, delta, why, tone = 'neutral', className }: Props) {
  const toneClasses: Record<Tone, string> = {
    positive: 'border-l-emerald-400 bg-emerald-50/60',
    negative: 'border-l-[#F2714C] bg-[#FFE7DD]/50',
    neutral: 'border-l-[#F9C349] bg-[#FDF5E0]/60',
    info: 'border-l-[#1A1D33] bg-[#1A1D33]/5',
  };
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 border-l-[3px] px-3 py-2 text-sm text-foreground/90',
        toneClasses[tone],
        className,
      )}
      role="note"
      aria-label="Auto-generated insight"
    >
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#DA9712]" aria-hidden />
      <p className="leading-relaxed">
        {text}
        {delta ? (
          <>
            {' '}
            <strong className="font-semibold text-[#B4820E]">{delta}</strong>
          </>
        ) : null}
        {why ? (
          <span className="ml-1 text-muted-foreground"> · {why}</span>
        ) : null}
      </p>
    </div>
  );
}
