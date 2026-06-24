'use client';

import { Keyboard, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

type ShortcutGroup = {
  label: string;
  items: Array<{ keys: string[]; action: string }>;
};

const GROUPS: ShortcutGroup[] = [
  {
    label: 'Global',
    items: [
      { keys: ['⌘', 'K'], action: 'Open command palette' },
      { keys: ['/'], action: 'Focus command palette (from body)' },
      { keys: ['?'], action: 'Toggle this help overlay' },
      { keys: ['Esc'], action: 'Close any overlay / modal' },
    ],
  },
  {
    label: 'Navigation',
    items: [
      { keys: ['G', 'H'], action: 'Go to Overview' },
      { keys: ['G', 'E'], action: 'Go to Executive deck' },
      { keys: ['G', 'S'], action: 'Go to Save Loop' },
      { keys: ['G', 'C'], action: 'Go to Ask Nexus AI' },
    ],
  },
  {
    label: 'On chart pages',
    items: [
      { keys: ['↵'], action: 'Drill into highlighted row' },
      { keys: ['E'], action: 'Email this page (mailto)' },
      { keys: ['P'], action: 'Capture (print to PDF)' },
      { keys: ['R'], action: 'Regenerate AI summary' },
    ],
  },
  {
    label: 'Executive deck',
    items: [
      { keys: ['→'], action: 'Next slide' },
      { keys: ['←'], action: 'Previous slide' },
      { keys: ['F'], action: 'Toggle full-screen' },
      { keys: ['Space'], action: 'Auto-play pause / resume' },
    ],
  },
];

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA';
      if (!inField && e.key === '?') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[#0F1120]/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
        <header className="flex items-center justify-between border-b border-border bg-nexus-navy px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-[#F9C349]" aria-hidden />
            <h2 className="font-display text-base font-semibold">Keyboard shortcuts</h2>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setOpen(false)}
            aria-label="Close shortcuts"
            className="text-white hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            {GROUPS.map((g) => (
              <div key={g.label} className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B4820E]">
                  {g.label}
                </p>
                <ul className="space-y-1.5">
                  {g.items.map((it) => (
                    <li key={`${g.label}-${it.action}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-foreground">{it.action}</span>
                      <span className="flex items-center gap-1">
                        {it.keys.map((k, i) => (
                          <span key={i} className="inline-flex">
                            <kbd className="rounded border border-border bg-white px-1.5 py-0.5 font-mono text-[10px]">
                              {k}
                            </kbd>
                            {i < it.keys.length - 1 ? (
                              <span className="mx-0.5 text-[10px] text-muted-foreground">+</span>
                            ) : null}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-4 rounded-md bg-[#FDF5E0] px-3 py-2 text-xs text-[#6F4D0A]">
            <span className="font-semibold">Pro tip:</span> Most shortcuts mirror Linear / Raycast conventions. Press{' '}
            <kbd className="rounded border border-border bg-white px-1 font-mono text-[10px]">?</kbd> any time to reopen this.
          </p>
        </div>
      </div>
    </div>
  );
}
