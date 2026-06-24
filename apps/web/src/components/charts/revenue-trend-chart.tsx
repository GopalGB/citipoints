'use client';

import { format } from 'date-fns';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatCompact } from '@/lib/format';
import type { TrendPoint } from '@/lib/types';

interface Props {
  data: TrendPoint[];
}

/**
 * Islamic calendar events relevant to UAE/Bahrain loyalty seasonality.
 * Coalition analytics must flag these: Gregorian-only tools mis-classify
 * the Ramadan spend spike as an anomaly when it's the single biggest
 * shopping window of the year for grocery + apparel partners.
 *
 * Hijri→Gregorian dates from [timeanddate.com / UAE Ministry published calendar].
 */
const ISLAMIC_EVENTS: { start: string; end: string; label: string; kind: 'fast' | 'feast' }[] = [
  // Ramadan 2024 — Mar 11 → Apr 9
  { start: '2024-03-11', end: '2024-04-09', label: 'Ramadan 2024', kind: 'fast' },
  { start: '2024-04-10', end: '2024-04-12', label: 'Eid al-Fitr 2024', kind: 'feast' },
  // Ramadan 2025 — Feb 28 → Mar 29
  { start: '2025-02-28', end: '2025-03-29', label: 'Ramadan 2025', kind: 'fast' },
  { start: '2025-03-30', end: '2025-04-01', label: 'Eid al-Fitr 2025', kind: 'feast' },
  // Ramadan 2026 — Feb 17 → Mar 18 (projected)
  { start: '2026-02-17', end: '2026-03-18', label: 'Ramadan 2026', kind: 'fast' },
  { start: '2026-03-19', end: '2026-03-21', label: 'Eid al-Fitr 2026', kind: 'feast' },
];

export function RevenueTrendChart({ data }: Props) {
  const series = data.map((d) => ({
    date: d.date,
    revenue: Number(d.revenue),
    transactions: Number(d.transactions),
  }));

  // Compute series range so we only render events that fall within it
  const minDate = series[0]?.date ?? '';
  const maxDate = series[series.length - 1]?.date ?? '';
  const overlays = ISLAMIC_EVENTS.filter(
    (e) => e.end >= minDate && e.start <= maxDate,
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="revenue-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />

        {/* Islamic calendar overlays — shade Ramadan fasting periods, mark Eid */}
        {overlays.map((ev) =>
          ev.kind === 'fast' ? (
            <ReferenceArea
              key={ev.label}
              x1={ev.start < minDate ? minDate : ev.start}
              x2={ev.end > maxDate ? maxDate : ev.end}
              y1={0}
              fill="#F9C349"
              fillOpacity={0.1}
              stroke="#DA9712"
              strokeOpacity={0.25}
              strokeDasharray="2 4"
              label={{
                value: ev.label,
                position: 'insideTop',
                fill: '#B4820E',
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          ) : (
            <ReferenceLine
              key={ev.label}
              x={ev.start}
              stroke="#F2714C"
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{
                value: ev.label.replace(' al-Fitr', ''),
                position: 'top',
                fill: '#F2714C',
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          ),
        )}

        <XAxis
          dataKey="date"
          tickFormatter={(v: string) => {
            const d = new Date(v);
            return Number.isNaN(d.getTime()) ? v : format(d, 'MMM d');
          }}
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          stroke="hsl(var(--muted-foreground))"
          interval="preserveStartEnd"
          minTickGap={32}
        />
        <YAxis
          tickFormatter={(v: number) => formatCompact(v)}
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          stroke="hsl(var(--muted-foreground))"
          width={50}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--surface))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number | string, key) => {
            const num = Number(value);
            if (key === 'revenue') return [`AED ${num.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`, 'Revenue'];
            return [num.toLocaleString('en-US'), 'Transactions'];
          }}
          labelFormatter={(label: string) => {
            const d = new Date(label);
            const dateStr = Number.isNaN(d.getTime()) ? label : format(d, 'EEE, MMM d yyyy');
            const event = ISLAMIC_EVENTS.find(
              (e) => label >= e.start && label <= e.end,
            );
            return event ? `${dateStr} · ${event.label}` : dateStr;
          }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#revenue-grad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
