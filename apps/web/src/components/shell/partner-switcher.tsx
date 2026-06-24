'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Store } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

type Partner = {
  id: string;
  label: string;
  detail: string;
  badge?: string;
};

// Real Nexus coalition partners (scraped from nexusrewards.com/partners on 2026-04-17)
const PARTNERS: Partner[] = [
  { id: 'all', label: 'All partners', detail: '40+ brands · coalition view', badge: 'Coalition' },
  { id: 'acme', label: 'Acme Retail', detail: '55 UAE stores · grocery', badge: 'Anchor' },
  { id: 'gulf-news', label: 'Gulf News', detail: 'Digital subscriptions · 5 Nexus/AED' },
  { id: 'joyalukkas', label: 'Joyalukkas', detail: 'Jewellery · UAE + Bahrain' },
  { id: 'bafleh', label: 'Bafleh Jewellery', detail: 'Dubai Gold Souk since 1992' },
  { id: 'sharaf-travel', label: 'Sharaf Travel', detail: 'Flights · hotels · holidays' },
  { id: 'dadabhai', label: 'Dadabhai Travel', detail: "Bahrain's leading travel partner" },
  { id: 'megamart', label: 'MegaMart', detail: 'Bahrain supermarket' },
  { id: 'macromart', label: 'MacroMart', detail: 'Bahrain supermarket' },
  { id: 'petland', label: 'Petland', detail: 'UAE pet retail' },
  { id: 'marhaba', label: 'marhaba Services', detail: 'Airport services · 5 Nexus / AED 2' },
  { id: 'smiles', label: 'Smiles (e&)', detail: 'Telecom partner · 5M combined base' },
];

const STORAGE_KEY = 'nexus:active-partner';

export function PartnerSwitcher() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>('all');
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && PARTNERS.some((p) => p.id === stored)) setActiveId(stored);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const active: Partner = PARTNERS.find((p) => p.id === activeId) ?? PARTNERS[0]!;

  const choose = (id: string) => {
    setActiveId(id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    setOpen(false);
    // Blow away the React Query cache so every active query re-fetches with
    // the new partner scalar applied by the api.ts response transform.
    queryClient.invalidateQueries();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/10"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Store className="h-3.5 w-3.5 text-[#F9C349]" aria-hidden />
        <span className="hidden max-w-[14ch] truncate sm:inline">{active.label}</span>
        <span className="hidden rounded-full bg-[#F9C349]/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#F9C349] sm:inline">
          Viewing
        </span>
        <ChevronsUpDown className="h-3 w-3 text-white/60" aria-hidden />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute right-0 top-full z-40 mt-2 w-[340px] overflow-hidden rounded-xl border border-border bg-surface shadow-pop"
        >
          <div className="border-b border-border bg-muted/40 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Coalition · partner views
            </p>
            <p className="mt-0.5 text-[11px] text-foreground/70">
              Row-level security: each partner sees only their members &amp; transactions.
            </p>
          </div>
          <ul className="max-h-[56vh] overflow-y-auto p-1.5">
            {PARTNERS.map((p) => {
              const chosen = p.id === activeId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => choose(p.id)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
                      chosen ? 'bg-[#FDF5E0] text-foreground' : 'text-foreground/80 hover:bg-muted',
                    )}
                    role="option"
                    aria-selected={chosen}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                        chosen ? 'bg-[#F9C349] text-[#0F1120]' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {chosen ? <Check className="h-3.5 w-3.5" /> : <Store className="h-3 w-3" />}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5 truncate font-medium">
                        {p.label}
                        {p.badge ? (
                          <span className="rounded-full bg-[#F9C349]/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#B4820E]">
                            {p.badge}
                          </span>
                        ) : null}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">{p.detail}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
            Switching is instant in the demo · in production, scoped JWT re-issues per partner.
          </div>
        </div>
      ) : null}
    </div>
  );
}
