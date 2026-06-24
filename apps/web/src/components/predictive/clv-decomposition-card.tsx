'use client';

import { Layers } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CLV_DECOMPOSITION_DEMO } from '@/lib/demo-data';
import { formatAED } from '@/lib/format';

const { median_clv, components } = CLV_DECOMPOSITION_DEMO;

export function ClvDecompositionCard() {
  const totalWeight = components.reduce((a, c) => a + c.weight, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-[#DA9712]" />
          CLV decomposition — median {formatAED(median_clv)} / 12 mo
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Where the 12-month CLV actually comes from. Repeat rate + frequency dominate; margin and life are the flatter levers.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stacked horizontal bar */}
        <div className="flex h-6 w-full overflow-hidden rounded-full border border-border">
          {components.map((c, i) => {
            const pct = (c.weight / totalWeight) * 100;
            const colours = ['#DA9712', '#F9C349', '#FBD06A', '#FDE4A8', '#FFF3D6'];
            return (
              <div
                key={c.factor}
                style={{ width: `${pct}%`, background: colours[i] ?? '#F9C349' }}
                title={`${c.factor} — ${pct.toFixed(0)}%`}
                className="flex items-center justify-center"
              >
                {pct > 10 ? (
                  <span className="text-[10px] font-semibold text-[#0F1120]">
                    {pct.toFixed(0)}%
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Row-by-row detail */}
        <ul className="space-y-1.5">
          {components.map((c) => (
            <li
              key={c.factor}
              className="flex flex-wrap items-baseline gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
            >
              <span className="font-medium">{c.factor}</span>
              <span className="font-display text-lg font-semibold tabular-nums">
                {c.value >= 1 ? c.value.toFixed(1) : `${(c.value * 100).toFixed(0)}%`}
              </span>
              <Badge variant="outline" className="text-[10px]">
                weight {(c.weight * 100).toFixed(0)}%
              </Badge>
              <span className="flex-1 text-right text-xs text-muted-foreground">{c.note}</span>
            </li>
          ))}
        </ul>

        <p className="rounded-md bg-[#FDF5E0] px-3 py-2 text-xs text-[#6F4D0A]">
          <span className="font-semibold">Leverage:</span> 1 pp repeat-rate uplift = AED 4.32 CLV gain per member.
          At 1.18M members that's <span className="font-semibold">AED 5.1M</span> in annual incremental CLV.
        </p>
      </CardContent>
    </Card>
  );
}
