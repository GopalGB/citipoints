'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { cn } from '@/lib/utils';

/**
 * Reusable blocks for Nexus presenter decks (Exec / Ops / Analyst).
 *
 * Every block is sized to live INSIDE an ExecCard `extra` slot — roughly
 * 900×340 px of canvas on a 1080p laptop. All blocks cap their own height so
 * the parent card never scrolls on a live demo.
 */

// ────────────────────────────────────────────────────────────
// MiniKpiStrip — 3-5 compact tiles for secondary context
// ────────────────────────────────────────────────────────────

export type StripTileTone = 'gold' | 'navy' | 'positive' | 'negative' | 'warning';

export interface StripTile {
  label: string;
  value: string;
  caption?: string;
  delta?: number | null;
  tone?: StripTileTone;
  icon?: ComponentType<{ className?: string }>;
}

const toneRing: Record<StripTileTone, string> = {
  gold: 'ring-[#F9C349]/30 bg-[#FDF5E0]',
  navy: 'ring-[#1A1D33]/15 bg-[#1A1D33]/5',
  positive: 'ring-emerald-200 bg-emerald-50',
  negative: 'ring-[#F2714C]/30 bg-[#FFE7DD]',
  warning: 'ring-[#F9C349]/40 bg-[#FFF3D6]',
};

export function MiniKpiStrip({ tiles }: { tiles: StripTile[] }) {
  return (
    <div
      className={cn(
        'grid auto-rows-fr gap-2 md:gap-3',
        tiles.length >= 5
          ? 'grid-cols-2 md:grid-cols-5'
          : tiles.length === 4
          ? 'grid-cols-2 md:grid-cols-4'
          : 'grid-cols-2 md:grid-cols-3',
      )}
    >
      {tiles.map((t) => {
        const Icon = t.icon;
        const tone = t.tone ?? 'navy';
        const Arrow =
          t.delta == null || t.delta === 0 ? Minus : t.delta > 0 ? ArrowUpRight : ArrowDownRight;
        const deltaColor =
          t.delta == null
            ? 'text-muted-foreground'
            : t.delta > 0
            ? 'text-emerald-700'
            : 'text-[#C84C2A]';
        return (
          <article
            key={t.label}
            className={cn(
              'grid min-h-[92px] grid-rows-[auto_1fr_auto] rounded-xl border border-border bg-white p-3 shadow-tile',
              'ring-1',
              toneRing[tone],
            )}
          >
            <header className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t.label}
              </span>
              {Icon ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/70">
                  <Icon className="h-3 w-3 text-[#B4820E]" aria-hidden />
                </span>
              ) : null}
            </header>
            <p className="mt-1 font-display text-[22px] font-semibold leading-none tabular-nums text-foreground">
              {t.value}
            </p>
            <footer className={cn('flex items-center gap-1 text-[10px] font-medium', deltaColor)}>
              <Arrow className="h-3 w-3 shrink-0" aria-hidden />
              <span className="shrink-0">
                {t.delta == null
                  ? '—'
                  : `${t.delta > 0 ? '+' : ''}${t.delta.toFixed(1)}%`}
              </span>
              {t.caption ? (
                <span className="ml-1 truncate text-muted-foreground">· {t.caption}</span>
              ) : null}
            </footer>
          </article>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// MiniTable — dense data table, 4-8 rows
// ────────────────────────────────────────────────────────────

export interface MiniTableColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T, rowIndex: number) => ReactNode;
  width?: string; // tailwind width class e.g. "w-24"
}

export function MiniTable<T>({
  columns,
  rows,
  empty,
  footer,
  rowKey,
}: {
  columns: MiniTableColumn<T>[];
  rows: T[];
  empty?: string;
  footer?: ReactNode;
  /** Derive a stable key per row. Defaults to array index (safe for static
   * rows that never reorder). Pass a unique property when rows can sort. */
  rowKey?: (row: T, i: number) => string | number;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white p-6 text-center text-xs text-muted-foreground">
        {empty ?? 'No rows yet.'}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-tile">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-[#FDFCF8] text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'border-b border-border px-3 py-2 font-semibold',
                  c.align === 'right'
                    ? 'text-right'
                    : c.align === 'center'
                    ? 'text-center'
                    : 'text-left',
                  c.width,
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row, i) : i} className="transition-colors hover:bg-[#FDF5E0]/40">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'border-b border-border/60 px-3 py-2 align-middle',
                    c.align === 'right'
                      ? 'text-right tabular-nums'
                      : c.align === 'center'
                      ? 'text-center'
                      : 'text-left',
                  )}
                >
                  {c.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footer ? (
        <div className="border-t border-border bg-[#FDFCF8] px-3 py-2 text-[11px] text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// MiniAreaChart — revenue trend / sparkline with axes
// ────────────────────────────────────────────────────────────

export function MiniAreaChart({
  data,
  height = 180,
  colorStroke = '#DA9712',
  colorFillTop = '#F9C349',
  label,
  valueFormat,
}: {
  data: { x: string; y: number }[];
  height?: number;
  colorStroke?: string;
  colorFillTop?: string;
  label?: string;
  valueFormat?: (v: number) => string;
}) {
  const id = `mini-area-${(label ?? 'x').replace(/\W/g, '')}`;
  return (
    <div className="rounded-xl border border-border bg-white p-3 shadow-tile" style={{ height }}>
      {label ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
      ) : null}
      <ResponsiveContainer width="100%" height={label ? height - 28 : height - 8}>
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorFillTop} stopOpacity={0.45} />
              <stop offset="100%" stopColor={colorFillTop} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="x" hide />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              background: 'white',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(v: number | string) => [valueFormat ? valueFormat(Number(v)) : String(v), '']}
            labelFormatter={(l: string) => l}
          />
          <Area
            type="monotone"
            dataKey="y"
            stroke={colorStroke}
            strokeWidth={2}
            fill={`url(#${id})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// MiniBarChart — horizontal ranking (stores, categories, brands)
// ────────────────────────────────────────────────────────────

export function MiniBarChart({
  data,
  height = 220,
  valueFormat,
  label,
}: {
  data: { name: string; value: number }[];
  height?: number;
  valueFormat?: (v: number) => string;
  label?: string;
}) {
  const palette = ['#F9C349', '#DA9712', '#B4820E', '#1A1D33', '#4B4F73', '#8B8FAE', '#BFC2D2'];
  return (
    <div className="rounded-xl border border-border bg-white p-3 shadow-tile" style={{ height }}>
      {label ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
      ) : null}
      <ResponsiveContainer width="100%" height={label ? height - 28 : height - 8}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 2, right: 12, bottom: 0, left: 0 }}
          barCategoryGap={4}
        >
          <CartesianGrid horizontal={false} stroke="#E8E5DC" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={128}
            tick={{ fontSize: 11, fill: '#4B4F73' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'white',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(v: number | string) => [valueFormat ? valueFormat(Number(v)) : String(v), '']}
            cursor={{ fill: '#FDF5E0' }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// MiniDonut — tier / category share, 4-6 slices
// ────────────────────────────────────────────────────────────

export function MiniDonut({
  data,
  height = 220,
  centerLabel,
  valueFormat,
}: {
  data: { name: string; value: number; color?: string }[];
  height?: number;
  centerLabel?: string;
  valueFormat?: (v: number) => string;
}) {
  const palette = ['#F9C349', '#DA9712', '#B4820E', '#1A1D33', '#4B4F73', '#8B8FAE'];
  return (
    <div
      className="relative rounded-xl border border-border bg-white p-3 shadow-tile"
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="52%"
            outerRadius="80%"
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={d.color ?? palette[i % palette.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'white',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(v: number | string, n: string) => [
              valueFormat ? valueFormat(Number(v)) : String(v),
              n,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerLabel ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[22px] font-semibold leading-none tabular-nums">
            {centerLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// BlockRow — two-column grid for chart + table combos
// ────────────────────────────────────────────────────────────

export function BlockRow({
  left,
  right,
  ratio = '1fr_1fr',
}: {
  left: ReactNode;
  right: ReactNode;
  ratio?: '1fr_1fr' | '2fr_1fr' | '1fr_2fr';
}) {
  const cls =
    ratio === '2fr_1fr'
      ? 'grid-cols-1 md:grid-cols-[2fr_1fr]'
      : ratio === '1fr_2fr'
      ? 'grid-cols-1 md:grid-cols-[1fr_2fr]'
      : 'grid-cols-1 md:grid-cols-2';
  return (
    <div className={cn('grid gap-3', cls)}>
      {left}
      {right}
    </div>
  );
}
