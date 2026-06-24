'use client';

/**
 * Branded loading indicators for the Nexus analytics dashboard.
 *
 * Drop-in replacements for generic gray skeletons. They use the Nexus
 * gold + cream palette and a subtle shimmer so the user never has to
 * guess whether data is loading or the page is frozen.
 *
 *   <NexusLoader />                   full-card loader for charts/tables
 *   <NexusLoader label="Fitting Prophet…" />   contextual label
 *   <NexusSkeleton className="h-7 w-40" />     inline placeholder
 *   <NexusSpinner size="sm" />        tiny inline spinner (e.g. buttons)
 */

import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export interface NexusLoaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Contextual caption — "Loading warehouse…", "Fitting XGBoost…", etc. */
  label?: string;
  /** Optional second line — sub-caption ("This takes ~3s on BigQuery"). */
  sublabel?: string;
  /** Min height for the loader card. */
  height?: number | string;
  /** Render as a compact inline strip instead of a centered card. */
  compact?: boolean;
}

export function NexusLoader({
  label = 'Loading warehouse',
  sublabel,
  height = 220,
  compact = false,
  className,
  ...rest
}: NexusLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'nexus-shimmer relative flex flex-col items-center justify-center gap-3 rounded-xl border border-[#F9C349]/25',
        compact ? 'px-4 py-3' : 'p-6',
        className,
      )}
      style={{ minHeight: typeof height === 'number' ? `${height}px` : height }}
      {...rest}
    >
      <NexusCoin size={compact ? 28 : 44} />
      <div className="relative z-10 text-center">
        <p
          className={cn(
            'font-semibold uppercase tracking-[0.14em] text-[#0F1120]',
            compact ? 'text-[10px]' : 'text-[11px]',
          )}
        >
          {label}
        </p>
        {sublabel && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">{sublabel}</p>
        )}
        {/* Three-dot rhythm feels more alive than a spinning wheel */}
        <div className="mt-2 flex justify-center gap-1" aria-hidden>
          <span
            className="nexus-dot h-1.5 w-1.5 rounded-full bg-[#DA9712]"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="nexus-dot h-1.5 w-1.5 rounded-full bg-[#F9C349]"
            style={{ animationDelay: '160ms' }}
          />
          <span
            className="nexus-dot h-1.5 w-1.5 rounded-full bg-[#F2714C]"
            style={{ animationDelay: '320ms' }}
          />
        </div>
      </div>
      <span className="sr-only">Loading data, please wait.</span>
    </div>
  );
}

/** Spinning gold coin. The central B sits inside the pulsing gold ring. */
export function NexusCoin({ size = 44 }: { size?: number }) {
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Pulsing halo */}
      <span
        className="nexus-ring absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, rgba(249, 195, 73, 0.45), transparent 70%)',
        }}
      />
      {/* Coin face — gold gradient with the Nexus "B" */}
      <span
        className="nexus-coin absolute inset-0 flex items-center justify-center rounded-full border border-[#B4820E]/40 font-display font-bold text-[#0F1120] shadow-[0_4px_14px_rgba(249,195,73,0.35)]"
        style={{
          background:
            'conic-gradient(from 180deg at 50% 50%, #F9C349, #DA9712, #F9C349)',
          fontSize: size * 0.42,
        }}
      >
        B
      </span>
    </div>
  );
}

export interface NexusSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional caption overlaid in the center (use sparingly). */
  label?: string;
}

/** Drop-in replacement for generic `<Skeleton />`. Matches Nexus gold. */
export function NexusSkeleton({
  label,
  className,
  ...rest
}: NexusSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        'nexus-shimmer relative overflow-hidden rounded-md',
        className,
      )}
      {...rest}
    >
      {label ? (
        <div className="relative z-10 flex h-full w-full items-center justify-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#B4820E]/80">
            {label}
          </span>
        </div>
      ) : null}
      <span className="sr-only">Loading {label ?? 'data'}</span>
    </div>
  );
}

/** Tiny inline spinner for buttons and row-level loading. */
export function NexusSpinner({
  size = 'sm',
  className,
}: {
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const px = size === 'xs' ? 12 : size === 'sm' ? 16 : 20;
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-block align-middle', className)}
      style={{ width: px, height: px }}
    >
      <span
        className="block h-full w-full animate-spin rounded-full border-[2px] border-[#F9C349]/30 border-t-[#DA9712]"
      />
    </span>
  );
}
