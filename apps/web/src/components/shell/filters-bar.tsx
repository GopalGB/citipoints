'use client';

import { Check, Filter, Share2, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';

import { SavedViews } from '@/components/shell/saved-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FiltersState, Tier } from '@/lib/types';
import { useDataBounds, type WindowKey } from '@/lib/window';

const WINDOW_OPTIONS: Array<{ id: WindowKey; label: string }> = [
  { id: '24h', label: 'Today' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: 'all', label: 'All' },
];

/** Compute `date_from` (and `date_to` when anchored) for a given window. */
function windowToRange(
  w: WindowKey,
  anchor?: string,
): { date_from?: string; date_to?: string } {
  if (w === 'all') return {};
  const days = w === '24h' ? 1 : w === '7d' ? 7 : w === '30d' ? 30 : 90;
  const anchorDate = anchor ? new Date(`${anchor}T00:00:00Z`) : new Date();
  const since = new Date(anchorDate);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return anchor
    ? { date_from: iso(since), date_to: anchor }
    : { date_from: iso(since) };
}

const STORES = [
  'Dubai Marina',
  'Downtown Dubai',
  'JBR Walk',
  'Business Bay',
  'Deira City Centre',
  'Abu Dhabi Mall',
  'Sharjah City Centre',
  'Al Ain Gateway',
  'Muscat Avenues',
  'Doha Festival City',
];

const CATEGORIES = ['Fresh Food', 'Beverages', 'Household', 'Personal Care'];
const TIERS: Tier[] = ['Platinum', 'Gold', 'Silver', 'Bronze'];

const ALL = '__all__';

type Options = { stores?: string[]; categories?: string[]; tiers?: Tier[] };

export function FiltersBar({ options }: { options?: Options }) {
  const router = useRouter();
  const params = useSearchParams();
  const [copied, setCopied] = useState(false);

  const store = params.get('store') ?? undefined;
  const category = params.get('category') ?? undefined;
  const tier = (params.get('tier') as Tier | null) ?? undefined;
  const windowParam = (params.get('window') as WindowKey | null) ?? 'all';
  const { data: bounds } = useDataBounds();
  const anchor = bounds?.max || undefined;

  const storeOptions = options?.stores ?? STORES;
  const categoryOptions = options?.categories ?? CATEGORIES;
  const tierOptions = options?.tiers ?? TIERS;

  const updateParam = useCallback(
    (key: keyof FiltersState, value?: string) => {
      const next = new URLSearchParams(params.toString());
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  /** Write both `window` (for the UI) and `date_from`/`date_to` (for the API) at once. */
  const pickWindow = useCallback(
    (w: WindowKey) => {
      const next = new URLSearchParams(params.toString());
      if (w === 'all') {
        next.delete('window');
        next.delete('date_from');
        next.delete('date_to');
      } else {
        next.set('window', w);
        const { date_from, date_to } = windowToRange(w, anchor);
        if (date_from) next.set('date_from', date_from);
        if (date_to) next.set('date_to', date_to);
        else next.delete('date_to');
      }
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [params, router, anchor],
  );

  const reset = () => router.replace('?', { scroll: false });

  const shareLink = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Fallback: select + prompt
      window.prompt('Copy this link:', window.location.href);
    }
  }, []);

  const chips: Array<{ key: keyof FiltersState; label: string }> = [];
  if (store) chips.push({ key: 'store', label: `Store: ${store}` });
  if (category) chips.push({ key: 'category', label: `Category: ${category}` });
  if (tier) chips.push({ key: 'tier', label: `Tier: ${tier}` });

  return (
    <section
      aria-label="Filters"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-tile"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" aria-hidden />
        <span className="font-medium text-foreground">Filters</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Time window — appears first so the eye reads it like Power BI's global slicer. */}
        <div
          role="tablist"
          aria-label="Time window"
          className="inline-flex items-center gap-0.5 rounded-full border border-border bg-white p-0.5 shadow-tile"
        >
          {WINDOW_OPTIONS.map((o) => {
            const chosen = o.id === windowParam;
            return (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={chosen}
                onClick={() => pickWindow(o.id)}
                className={
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold transition ' +
                  (chosen
                    ? 'bg-[#F9C349] text-[#0F1120] shadow-[0_2px_8px_rgba(249,195,73,0.35)]'
                    : 'text-foreground/75 hover:bg-muted')
                }
              >
                {o.label}
              </button>
            );
          })}
        </div>

        <Select
          value={store ?? ALL}
          onValueChange={(v) => updateParam('store', v === ALL ? undefined : v)}
        >
          <SelectTrigger className="h-9 w-[180px]" aria-label="Store filter">
            <SelectValue placeholder="All stores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All stores</SelectItem>
            {storeOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={category ?? ALL}
          onValueChange={(v) => updateParam('category', v === ALL ? undefined : v)}
        >
          <SelectTrigger className="h-9 w-[180px]" aria-label="Category filter">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categoryOptions.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={tier ?? ALL}
          onValueChange={(v) => updateParam('tier', v === ALL ? undefined : v)}
        >
          <SelectTrigger className="h-9 w-[160px]" aria-label="Tier filter">
            <SelectValue placeholder="All tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All tiers</SelectItem>
            {tierOptions.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {chips.length > 0 ? (
          <div className="ml-1 flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <Badge
                key={chip.key}
                variant="primary"
                className="pr-1 text-xs"
              >
                {chip.label}
                <button
                  aria-label={`Clear ${chip.key}`}
                  className="ml-1 rounded-full p-0.5 hover:bg-primary/15"
                  onClick={() => updateParam(chip.key, undefined)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <Button size="sm" variant="ghost" onClick={reset}>
              Reset
            </Button>
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          <SavedViews />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={shareLink}
            aria-label="Copy shareable link to this view"
            title="Copy link — filters + view state preserved"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" />
                Share link
              </>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function parseFilters(searchParams: URLSearchParams): FiltersState {
  return {
    store: searchParams.get('store') ?? undefined,
    category: searchParams.get('category') ?? undefined,
    tier: (searchParams.get('tier') as Tier | null) ?? undefined,
    date_from: searchParams.get('date_from') ?? undefined,
    date_to: searchParams.get('date_to') ?? undefined,
  };
}
