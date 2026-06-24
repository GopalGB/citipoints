'use client';

import type { ReactNode } from 'react';

// Old-school numeric formatters used across the simple/Tableau-genre pages.
// Indian-CXO calibration: AED with comma separators, en-IN for member counts
// (lakh/crore reflex), pp/percent strings via `fmtPct`.

export const fmtAED = (n: number) =>
  new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n);

export const fmtNum = (n: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);

export const fmtPct = (n: number, decimals = 1) =>
  `${n >= 0 ? '+' : ''}${n.toFixed(decimals)} %`;

export const tickAED = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
};

// Indian / GCC retail abbreviations. Not used everywhere — just where the
// scoreboard density helps.
export const tickShort = (v: number) => {
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
};

export function KpiTile({
  label,
  value,
  delta,
  direction = 'flat',
  caption,
}: {
  label: string;
  value: string;
  delta?: string;
  direction?: 'up' | 'down' | 'flat';
  caption?: string;
}) {
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—';
  const color =
    direction === 'up' ? '#0A7A3B' : direction === 'down' ? '#B11226' : '#666666';
  return (
    <div className="border border-[#E5E5E5] bg-white px-4 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#666666]">
        {label}
      </div>
      <div className="mt-3 font-display text-[28px] font-semibold leading-none text-[#14213D]">
        {value}
      </div>
      <div className="mt-3 font-mono text-[12px]" style={{ color }}>
        {delta ? `${arrow} ${delta}` : caption ?? ''}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  rightLabel,
  rightValue,
}: {
  title: string;
  subtitle?: string;
  rightLabel?: string;
  rightValue?: string;
}) {
  return (
    <header className="mb-5 flex items-end justify-between gap-4 border-b border-[#E5E5E5] pb-4">
      <div>
        <h1 className="font-display text-[22px] font-semibold leading-tight text-[#14213D]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-[12px] text-[#666]">{subtitle}</p>
        ) : null}
      </div>
      {rightLabel ? (
        <div className="text-right text-[10px] font-mono text-[#888]">
          <div className="uppercase tracking-[0.12em]">{rightLabel}</div>
          {rightValue ? (
            <div className="mt-0.5 text-[11px] text-[#1F1F1F]">{rightValue}</div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

export function SectionCard({
  title,
  caption,
  right,
  children,
  noBodyPadding = false,
  className = '',
}: {
  title: string;
  caption?: string;
  right?: ReactNode;
  children: ReactNode;
  noBodyPadding?: boolean;
  className?: string;
}) {
  return (
    <section className={`border border-[#E5E5E5] bg-white ${className}`}>
      <header
        className={`flex items-center justify-between gap-3 ${
          noBodyPadding
            ? 'border-b border-[#E5E5E5] px-4 py-3'
            : 'px-4 pt-4'
        }`}
      >
        <div>
          <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.10em] text-[#14213D]">
            {title}
          </h2>
          {caption ? (
            <p className="mt-0.5 text-[11px] text-[#666]">{caption}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </header>
      <div className={noBodyPadding ? '' : 'p-4 pt-3'}>{children}</div>
    </section>
  );
}

export function HBar({
  label,
  rank,
  pct,
  rightLabel,
}: {
  label: string;
  rank: number;
  pct: number;
  rightLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <div className="w-5 text-right font-mono text-[11px] text-[#999]">{rank}.</div>
      <div className="w-32 truncate font-medium text-[#1F1F1F]">{label}</div>
      <div className="relative h-5 flex-1 bg-[#F5F5F5]">
        <div
          className="h-full bg-[#14213D]"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <div className="w-14 text-right font-mono text-[12px] font-semibold text-[#1F1F1F]">
        {pct.toFixed(1)} %
      </div>
      {rightLabel ? (
        <div className="w-20 text-right font-mono text-[11px] text-[#888]">
          {rightLabel}
        </div>
      ) : null}
    </div>
  );
}

export function PlainTable({
  columns,
  rows,
  emptyMessage = 'Loading…',
}: {
  columns: Array<{
    key: string;
    label: string;
    align?: 'left' | 'right';
    mono?: boolean;
    bold?: boolean;
    width?: string;
  }>;
  rows: Array<Record<string, ReactNode>>;
  emptyMessage?: string;
}) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-left text-[10px] font-semibold uppercase tracking-[0.10em] text-[#666]">
          {columns.map((c) => (
            <th
              key={c.key}
              className={`px-4 py-2 ${c.align === 'right' ? 'text-right' : ''}`}
              style={c.width ? { width: c.width } : undefined}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td
              colSpan={columns.length}
              className="px-4 py-8 text-center text-[12px] text-[#888]"
            >
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((r, i) => (
            <tr
              key={(r._key as string) ?? i}
              className={i % 2 === 1 ? 'bg-[#FAFAFA]' : 'bg-white'}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-4 py-2 ${c.align === 'right' ? 'text-right' : ''} ${
                    c.mono ? 'font-mono' : ''
                  } ${c.bold ? 'font-semibold text-[#14213D]' : ''}`}
                >
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
