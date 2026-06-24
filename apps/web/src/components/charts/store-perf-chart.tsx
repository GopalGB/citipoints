'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatAED, formatCompact } from '@/lib/format';
import type { StorePerfItem } from '@/lib/types';

export function StorePerfChart({ data }: { data: StorePerfItem[] }) {
  const ordered = [...data].sort((a, b) => a.revenue - b.revenue);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={ordered} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v: number) => formatCompact(v)}
          fontSize={11}
          stroke="hsl(var(--muted-foreground))"
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="store"
          width={130}
          fontSize={12}
          stroke="hsl(var(--foreground))"
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--surface))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number | string) => formatAED(Number(value))}
        />
        <Bar dataKey="revenue" radius={[4, 4, 4, 4]} fill="hsl(var(--primary))" />
      </BarChart>
    </ResponsiveContainer>
  );
}
