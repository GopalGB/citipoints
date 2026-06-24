'use client';

import { Bookmark, Check, Plus, Trash2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

type SavedView = {
  id: string;
  name: string;
  path: string;
  query: string;
  ts: string;
};

const STORAGE_KEY = 'nexus:saved-views';

/**
 * Saved views = bookmark a named filter + URL state. Lives next to FiltersBar.
 * Persisted to localStorage (demo). Production swap: store per-user on backend.
 */
export function SavedViews() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [views, setViews] = useState<SavedView[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setViews(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: SavedView[]) => {
    setViews(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
  };

  const saveCurrent = () => {
    const name = draft.trim();
    if (!name) return;
    const v: SavedView = {
      id: `V-${Date.now()}`,
      name,
      path: pathname,
      query: params.toString(),
      ts: new Date().toISOString(),
    };
    persist([v, ...views]);
    setDraft('');
  };

  const openView = (v: SavedView) => {
    const url = v.query ? `${v.path}?${v.query}` : v.path;
    router.push(url);
    setOpen(false);
  };

  const remove = (id: string) => {
    persist(views.filter((v) => v.id !== id));
  };

  return (
    <div className="relative">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bookmark className="h-3.5 w-3.5" />
        Saved views
        {views.length > 0 ? (
          <span className="ml-1 rounded-full bg-[#F9C349] px-1.5 text-[10px] font-semibold text-[#0F1120]">
            {views.length}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-[320px] rounded-xl border border-border bg-surface shadow-pop"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B4820E]">
              Save current view
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                aria-label="View name"
                placeholder="Name this view…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveCurrent();
                }}
                className="h-8 flex-1 rounded-md border border-border bg-white px-2 text-sm focus:border-[#F9C349] focus:outline-none"
              />
              <Button type="button" size="sm" onClick={saveCurrent} disabled={!draft.trim()}>
                <Plus className="h-3.5 w-3.5" />
                Save
              </Button>
            </div>
          </div>

          <ul className="max-h-64 overflow-y-auto py-1">
            {views.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-muted-foreground">
                No saved views yet. Set filters, then save this view for next time.
              </li>
            ) : (
              views.map((v) => (
                <li
                  key={v.id}
                  className="group flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50"
                >
                  <button
                    type="button"
                    onClick={() => openView(v)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                    <span className="flex flex-col">
                      <span className="font-medium text-foreground">{v.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {v.path}
                        {v.query ? `?${v.query}` : ''}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(v.id)}
                    className="opacity-0 transition hover:text-rose-600 group-hover:opacity-100"
                    aria-label={`Delete saved view ${v.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
