'use client';

import {
  AlertTriangle,
  Award,
  Calendar,
  Coins,
  Crown,
  Layers,
  LifeBuoy,
  Sparkles,
  Store,
  Target,
  TrendingUp,
} from 'lucide-react';
import { type ComponentType } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Insight, InsightPriority } from '@/lib/types';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  'alert-triangle': AlertTriangle,
  'trending-up': TrendingUp,
  coins: Coins,
  calendar: Calendar,
  store: Store,
  crown: Crown,
  sparkles: Sparkles,
  layers: Layers,
  'life-buoy': LifeBuoy,
  award: Award,
  target: Target,
};

const PRIORITY_STYLES: Record<InsightPriority, { badge: 'primary' | 'success' | 'warning' | 'danger'; label: string; border: string }> = {
  info: { badge: 'primary', label: 'INFO', border: 'border-l-primary' },
  opportunity: { badge: 'success', label: 'OPPORTUNITY', border: 'border-l-success' },
  warning: { badge: 'warning', label: 'WARNING', border: 'border-l-warning' },
  critical: { badge: 'danger', label: 'CRITICAL', border: 'border-l-danger' },
};

export function InsightStrip({ question, insights }: { question: string; insights: Insight[] }) {
  return (
    <section aria-live="polite" aria-label="Auto-generated insights" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="text-foreground font-medium">Question this page answers:</span>
        <span className="text-balance">{question}</span>
      </div>

      {insights.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            No anomalies or opportunities detected in the current window. Try widening the filters.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {insights.map((insight) => {
            const style = PRIORITY_STYLES[insight.priority];
            const Icon = ICON_MAP[insight.icon ?? ''] ?? Sparkles;
            return (
              <li key={insight.id}>
                <Card className={cn('h-full border-l-4', style.border)}>
                  <CardContent className="flex flex-col gap-2 pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                          <Icon className="h-4 w-4 text-foreground" aria-hidden />
                        </span>
                        <Badge variant={style.badge}>{style.label}</Badge>
                      </div>
                      {insight.evidence_chart_id ? (
                        <a
                          href={`#${insight.evidence_chart_id}`}
                          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          See evidence ↓
                        </a>
                      ) : null}
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">{insight.title}</h3>
                    <p className="text-sm text-muted-foreground text-balance">{insight.text}</p>
                    {insight.action ? (
                      <p className="mt-1 rounded-md bg-muted/60 px-3 py-2 text-xs text-foreground">
                        <span className="font-medium">What to do next: </span>
                        {insight.action}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
