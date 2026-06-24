'use client';

import { useMutation } from '@tanstack/react-query';
import { BrainCircuit, Coins, Search, Wallet } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatAED, formatCompact } from '@/lib/format';

// Demo wallet — synthetic balance keyed off the customer id so the same id
// always shows the same balance. Replaced in Phase 2 with the real wallet tile.
function synthBalance(customerId: string): number {
  let h = 0;
  for (const c of customerId) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return 1200 + (h % 9800); // 1,200 – 11,000 Nexus
}

export default function RecommendationsPage() {
  const [customerId, setCustomerId] = useState('CUST-10001');

  const mutation = useMutation({
    mutationFn: (id: string) => api.recommendations(id, 6),
  });
  const nba = useMutation({ mutationFn: (id: string) => api.nba(id) });

  const runFor = (id: string) => {
    mutation.mutate(id);
    nba.mutate(id);
  };

  return (
    <div className="animate-fade-up space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">
          Recommendations · Hybrid (content + collaborative)
        </p>
        <h1 className="font-display text-2xl font-semibold md:text-3xl">
          What should we offer this member — and what can they redeem right now?
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          A CMO + ops view. Content-based scoring for category affinity + collaborative signals
          from FP-Growth. Every recommendation ships with a plain-English reason, and we show
          the member&apos;s current Nexus balance so ops can pair the offer with a redemption
          nudge.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-primary" />
            <CardTitle>Generate recommendations</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              runFor(customerId.trim());
            }}
          >
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Customer ID"
                className="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm shadow-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="e.g. CUST-10042"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Scoring…' : 'Recommend'}
            </Button>
            {['CUST-10001', 'CUST-10100', 'CUST-10500'].map((id) => (
              <Button
                key={id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCustomerId(id);
                  runFor(id);
                }}
              >
                {id}
              </Button>
            ))}
          </form>

          {/* Current Nexus wallet — synthetic for demo, keyed off the customer id */}
          {mutation.data || nba.data ? (
            <div className="grid auto-rows-fr gap-3 sm:grid-cols-2">
              {(() => {
                const balance = synthBalance(customerId.trim() || 'CUST-10001');
                const redeemable = balance / 200; // 200 Nexus = AED 1
                return (
                  <>
                    <div className="flex items-center gap-3 rounded-lg border border-[#F9C349]/30 bg-[#FDF5E0] p-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F9C349]/40 text-[#B4820E]">
                        <Coins className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#B4820E]">
                          Nexus balance
                        </p>
                        <p className="font-display text-lg font-semibold tabular-nums">
                          {formatCompact(balance)} Nexus
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-[#1A1D33] ring-1 ring-border">
                        <Wallet className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Redeemable today
                        </p>
                        <p className="font-display text-lg font-semibold tabular-nums">
                          {formatAED(redeemable)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          at 200 Nexus = AED 1 · demo wallet
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : null}

          {nba.data ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <Badge variant="primary" className="mb-2">Next-best-action</Badge>
              <p className="text-sm font-semibold text-foreground">{nba.data.action}</p>
              <p className="mt-1 text-sm text-muted-foreground">{nba.data.rationale}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Expected uplift: AED {nba.data.expected_uplift_aed.toLocaleString('en-AE', { maximumFractionDigits: 2 })}
              </p>
            </div>
          ) : null}

          {mutation.isPending ? (
            <ul className="grid auto-rows-fr gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </ul>
          ) : mutation.data?.recommendations?.length ? (
            <ul className="grid auto-rows-fr gap-3 md:grid-cols-2 xl:grid-cols-3">
              {mutation.data.recommendations.map((rec) => (
                <li
                  key={rec.sku_id}
                  className="flex h-full flex-col justify-between rounded-lg border border-border bg-surface p-4 shadow-tile"
                >
                  <div>
                    <p className="text-sm font-semibold">{rec.product_name}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{rec.sku_id}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{rec.reason}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <Badge variant="primary">Score {rec.score.toFixed(2)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : mutation.isError ? (
            <p className="text-sm text-danger">
              {mutation.error instanceof Error ? mutation.error.message : 'Failed.'}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
