'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatAED, formatCompact, formatInt } from '@/lib/format';
import type { TierDistItem } from '@/lib/types';

export function TierDistChart({ data }: { data: TierDistItem[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="tier" fontSize={12} stroke="hsl(var(--muted-foreground))" tickLine={false} />
        <YAxis
          yAxisId="left"
          tickFormatter={(v: number) => formatCompact(v)}
          fontSize={11}
          stroke="hsl(var(--muted-foreground))"
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickLine={false}
          width={48}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(v: number) => formatCompact(v)}
          fontSize={11}
          stroke="hsl(var(--muted-foreground))"
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickLine={false}
          width={52}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--surface))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number | string, name) => {
            const num = Number(value);
            if (name === 'revenue') return [formatAED(num), 'Revenue'];
            return [formatInt(num), 'Members'];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="members" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="right" dataKey="revenue" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
