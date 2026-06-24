'use client';

import { ArrowRight, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'nexus:tour-seen';

type Step = {
  title: string;
  body: string;
  cta?: { label: string; href: string };
};

const STEPS: Step[] = [
  {
    title: 'Welcome to Nexus Partner Analytics',
    body: 'Power BI replacement for the Nexus coalition. 1.2M members · 55 Acme Retail stores · IFRS 15 compliant · PDPL-ready.',
  },
  {
    title: 'Try the agentic Save Loop',
    body: "The moat. Natural-language command → segment → draft offer → holdout → lift report. Not a dashboard — a decision engine.",
    cta: { label: 'Open Save Loop', href: '/save-loop' },
  },
  {
    title: 'Executive deck, three lenses',
    body: "Board-ready view with CEO, CFO, and CMO lens switcher. Press F for full-screen. Arrow keys navigate.",
    cta: { label: 'Open Executive', href: '/executive' },
  },
  {
    title: 'Ask Nexus AI',
    body: 'Natural-language Q&A over the warehouse. SQL audit trail on every answer. Follow-up hints after each reply.',
    cta: { label: 'Open chat', href: '/chat' },
  },
  {
    title: 'Keyboard shortcuts',
    body: 'Press ? any time for the full shortcut map. ⌘K opens the command palette. Esc closes anything.',
  },
];

export function ProductTour() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(STORAGE_KEY) === '1';
    if (!seen) {
      // Defer so the page can render first
      const t = setTimeout(() => setShow(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const markSeen = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, '1');
    }
    setShow(false);
    setStep(0);
  };

  if (!show) return null;

  const s = STEPS[step];
  if (!s) {
    markSeen();
    return null;
  }

  const next = () => {
    if (step + 1 >= STEPS.length) {
      markSeen();
    } else {
      setStep(step + 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-end p-6"
      role="dialog"
      aria-modal="false"
      aria-label="Product tour"
    >
      <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-[#F9C349]/40 bg-surface shadow-pop ring-1 ring-[#F9C349]/30">
        <header className="flex items-start justify-between gap-3 bg-nexus-navy px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#F9C349]" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <button
            type="button"
            onClick={markSeen}
            aria-label="Dismiss tour"
            className="text-white/70 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-2 p-4">
          <h3 className="font-display text-base font-semibold text-foreground">{s.title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="flex gap-1">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={
                    'h-1.5 w-4 rounded-full transition ' +
                    (i === step ? 'bg-[#DA9712]' : 'bg-muted')
                  }
                  aria-hidden
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {s.cta ? (
                <Link
                  href={s.cta.href}
                  onClick={markSeen}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
                >
                  {s.cta.label}
                </Link>
              ) : null}
              <Button type="button" size="sm" onClick={next}>
                {step + 1 >= STEPS.length ? 'Done' : 'Next'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
