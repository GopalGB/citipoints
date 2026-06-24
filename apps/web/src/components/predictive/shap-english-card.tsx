'use client';

import { BrainCircuit, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SHAP_ENGLISH_DEMO } from '@/lib/demo-data';
import { formatPct } from '@/lib/format';

const { member, churn_probability, decision_plot, plain_english } = SHAP_ENGLISH_DEMO;

/**
 * SHAP → plain English. The "why is this member flagged?" card. Operators don't
 * read SHAP diagrams; they read sentences. This turns numeric contributions into
 * individual explanations + one rolled-up paragraph.
 */
export function ShapEnglishCard() {
  const sorted = [...decision_plot].sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap));
  const maxAbs = Math.max(...sorted.map((f) => Math.abs(f.shap)));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BrainCircuit className="h-4 w-4 text-[#DA9712]" />
          Why is {member} at risk?
          <Badge variant="danger" className="ml-auto">
            {formatPct(churn_probability * 100, 0)} churn
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          SHAP feature importances turned into operator-readable reasons. Plus → increases churn risk. Minus → protects.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Bar chart */}
        <ul className="space-y-1.5">
          {sorted.map((f) => {
            const pct = (Math.abs(f.shap) / maxAbs) * 100;
            const pos = f.shap > 0;
            return (
              <li key={f.feature} className="space-y-1 rounded-md border border-border bg-muted/20 px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{f.feature}</span>
                  <span className="text-xs">
                    = <span className="font-semibold">{typeof f.raw === 'number' && f.raw < 1 && f.raw > 0 ? f.raw.toFixed(2) : f.raw}</span>
                  </span>
                  <Badge
                    variant={pos ? 'danger' : 'success'}
                    className="ml-auto text-[10px]"
                  >
                    SHAP {pos ? '+' : ''}
                    {f.shap.toFixed(2)}
                  </Badge>
                </div>
                <div className="flex h-2 w-full items-center overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-2 rounded-full ${pos ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs leading-relaxed text-foreground">{f.narrative}</p>
              </li>
            );
          })}
        </ul>

        {/* Plain English rollup */}
        <p className="rounded-md border border-[#F9C349]/40 bg-[#FDF5E0] px-4 py-3 text-sm text-[#6F4D0A]">
          <Sparkles className="mr-1 inline h-4 w-4" />
          <span className="font-semibold">In plain English:</span> {plain_english}
        </p>
      </CardContent>
    </Card>
  );
}
