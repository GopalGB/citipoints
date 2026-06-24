'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { formatAED } from '@/lib/format';
import type { CategoryMixItem } from '@/lib/types';

// Nexus palette — gold / orange / warm / navy mix for category differentiation.
const COLORS = ['#DA9712', '#F2714C', '#F9C349', '#B4820E', '#0F1120', '#6B4A1D', '#C84C2A'];

export function CategoryMixChart({ data }: { data: CategoryMixItem[] }) {
  const total = data.reduce((s, d) => s + d.revenue, 0);
  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="revenue"
            nameKey="category"
            innerRadius="60%"
            outerRadius="85%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell key={entry.category} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--surface))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number | string, name) => [formatAED(Number(value)), name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Revenue</span>
        <span className="text-[22px] font-semibold tabular-nums">{formatAED(total)}</span>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        {data.map((d, i) => (
          <li key={d.category} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="truncate text-foreground">{d.category}</span>
            <span className="ml-auto tabular-nums">{d.share_pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
