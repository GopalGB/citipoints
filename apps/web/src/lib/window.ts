/**
 * Shared time-window helpers used by every dashboard page.
 *
 * Pages pass a WindowKey to `windowToFilters()` and use the returned
 * FiltersState in their API calls. Window state is persisted to
 * localStorage via `useWindow()` so switching pages preserves the user's
 * current time lens (much like Power BI's global slicer).
 *
 * Anchoring: windows are computed relative to the **latest transaction
 * date** in the warehouse, not the wall-clock date. This means a demo
 * dataset that ends Mar-31 still produces useful "last 7 days" results,
 * AND a production feed with day-of lag still makes sense to a CFO.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from './api';
import type { FiltersState } from './types';
import type { WindowKey } from '@/components/exec/cxo-dashboard';

export { WINDOW_LABELS, type WindowKey } from '@/components/exec/cxo-dashboard';

const EMPTY_FILTERS: FiltersState = {};

/**
 * Convert a WindowKey to a FiltersState.
 *
 * @param w       The chosen window ("24h" | "7d" | "30d" | "90d" | "all").
 * @param anchor  Optional ISO date (YYYY-MM-DD). When provided, windows
 *                are computed backward from this date. When omitted we
 *                fall back to the wall clock (original behaviour).
 */
export function windowToFilters(w: WindowKey, anchor?: string): FiltersState {
  if (w === 'all') return EMPTY_FILTERS;
  // Without an anchor, we can't compute a meaningful window — demo data
  // ends months before wall clock, so a wall-clock window returns zero
  // rows. Fall back to "all time" until the data-bounds query resolves,
  // then the anchored window takes over. Prevents the zeros-on-load bug.
  if (!anchor) return EMPTY_FILTERS;
  const days = w === '24h' ? 1 : w === '7d' ? 7 : w === '30d' ? 30 : 90;
  const anchorDate = new Date(`${anchor}T00:00:00Z`);
  const since = new Date(anchorDate);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { date_from: iso(since), date_to: anchor };
}

/**
 * Fetch the warehouse date bounds once per session. React Query keeps the
 * result in cache so every page hook reuses the same lookup. Stays
 * reactive — if the warehouse extends (next day's load) the value
 * refreshes on the next mount.
 */
export function useDataBounds() {
  return useQuery({
    queryKey: ['meta-date-bounds'],
    queryFn: () => api.dateBounds(),
    staleTime: 60_000,
  });
}

/**
 * React hook that combines useWindow + useDataBounds and returns a
 * ready-to-use FiltersState. Pages that use this get auto-anchored
 * windows without any extra wiring.
 */
export function useWindowFilters(
  storageKey: string,
  initial: WindowKey = 'all',
): {
  timeWindow: WindowKey;
  setWindow: (w: WindowKey) => void;
  filters: FiltersState;
  anchor: string | undefined;
} {
  const [timeWindow, setWindow] = useWindow(storageKey, initial);
  const { data: bounds } = useDataBounds();
  const anchor = bounds?.max || undefined;
  const filters = windowToFilters(timeWindow, anchor);
  return { timeWindow, setWindow, filters, anchor };
}

/**
 * React hook that owns the time-window state for a given page and mirrors
 * it to localStorage. Pass a stable storage key like `nexus:window:fraud`
 * so each page remembers its own selection independently.
 */
export function useWindow(
  storageKey: string,
  initial: WindowKey = 'all',
): [WindowKey, (w: WindowKey) => void] {
  const [value, setValue] = useState<WindowKey>(initial);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(storageKey);
    if (
      stored === '24h' ||
      stored === '7d' ||
      stored === '30d' ||
      stored === '90d' ||
      stored === 'all'
    ) {
      setValue(stored);
    }
  }, [storageKey]);

  const update = (w: WindowKey) => {
    setValue(w);
    if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, w);
  };

  return [value, update];
}
