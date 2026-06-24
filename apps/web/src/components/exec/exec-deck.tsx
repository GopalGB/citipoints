'use client';

import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import {
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Pause,
  Play,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { ExecCard, type ExecCardProps } from './exec-card';

type Card = Omit<ExecCardProps, 'indexLabel' | 'kicker'> & {
  id: string;
  kicker: string;
};

/**
 * Keyboard-first exec briefing. Embla carousel + bespoke shortcuts.
 * ←/→/A/D/J/K — cycle ·  Space — next ·  1-9 — jump ·  P — presenter toggle ·
 * ? — keyboard help  ·  Esc — exit to ops dashboard.
 *
 * WAI-ARIA carousel pattern: https://www.w3.org/WAI/ARIA/apg/patterns/carousel/
 *
 * `topSlot` — optional control (e.g. view switcher) that renders inline
 * between Exit and the presenter controls so it never overlaps other widgets.
 * `exitHref` — where Esc + Exit button should route (default `/`).
 * `label` — top-strip badge text (default "Exec briefing").
 */
export function ExecDeck({
  cards,
  topSlot,
  exitHref = '/',
  label = 'Exec briefing',
}: {
  cards: Card[];
  topSlot?: ReactNode;
  exitHref?: string;
  label?: string;
}) {
  const router = useRouter();
  const autoplay = useRef(Autoplay({ delay: 30_000, stopOnInteraction: false, playOnInit: false }));
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: 'center', skipSnaps: false }, [autoplay.current]);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const total = cards.length;

  const scrollTo = useCallback((idx: number) => emblaApi?.scrollTo(idx), [emblaApi]);
  const next = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const prev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);

  const togglePlay = useCallback(() => {
    if (!emblaApi) return;
    if (playing) {
      autoplay.current.stop();
      setPlaying(false);
    } else {
      autoplay.current.play();
      setPlaying(true);
    }
  }, [emblaApi, playing]);

  // Track selected slide
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (inInput) return;
      // Do NOT preventDefault on Space/letter keys when the user is focused on a
      // button — that breaks native button activation (Exit, tabs, help-close).
      const onInteractive = target && (target.tagName === 'BUTTON' || target.tagName === 'A' || target.getAttribute('role') === 'tab');
      if (onInteractive && (e.key === ' ' || /^[a-zA-Z]$/.test(e.key))) return;
      if (helpOpen && e.key !== 'Escape' && e.key !== '?') return;

      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'k' || e.key === 'K' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Home') {
        e.preventDefault();
        scrollTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        scrollTo(total - 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (helpOpen) setHelpOpen(false);
        else router.push(exitHref);
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((v) => !v);
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < total) {
          e.preventDefault();
          scrollTo(idx);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, scrollTo, total, togglePlay, helpOpen, router, exitHref]);

  const indexLabel = useMemo(() => `${selected + 1} / ${total}`, [selected, total]);

  return (
    <div className="flex h-[calc(100vh-64px)] min-h-[520px] flex-col bg-[#F8F7F3]">
      {/* Top strip — exit + topSlot + presenter controls. flex-wrap so mid-width
          screens never collide widgets. topSlot takes priority (min-width) so
          the window selector is never pushed off-screen on narrow viewports. */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{topSlot}</div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-[#FDF5E0] px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-[#B4820E]">
            {label} · {indexLabel}
          </span>

          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
            aria-label={playing ? 'Pause presenter auto-advance' : 'Start presenter auto-advance'}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? 'Pause' : 'Auto'}
          </button>

          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
            aria-label="Show keyboard shortcuts (?)"
          >
            <Keyboard className="h-3.5 w-3.5" /> Shortcuts · ?
          </button>
        </div>
      </div>

      {/* Viewport */}
      <div className="relative flex-1 overflow-hidden" ref={emblaRef}>
        <div className="flex h-full touch-pan-y">
          {cards.map((c, i) => (
            <div key={c.id} className="mx-3 flex h-full w-[92%] max-w-[1400px] shrink-0 md:mx-6 lg:w-[88%]">
              <ExecCard {...c} indexLabel={`${i + 1} / ${total}`} />
            </div>
          ))}
        </div>

        {/* Side nav buttons */}
        <button
          type="button"
          onClick={prev}
          aria-label="Previous card (←)"
          className={cn(
            'absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-tile transition hover:bg-muted',
            selected === 0 && 'pointer-events-none opacity-40',
          )}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Next card (→)"
          className={cn(
            'absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-tile transition hover:bg-muted',
            selected === total - 1 && 'pointer-events-none opacity-40',
          )}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pb-6 pt-4">
        {cards.map((c, i) => {
          const active = i === selected;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => scrollTo(i)}
              aria-label={`Go to card ${i + 1}: ${c.title}`}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'h-1.5 rounded-full transition-all',
                active ? 'w-10 bg-[#F9C349]' : 'w-4 bg-border hover:bg-muted-foreground/40',
              )}
            />
          );
        })}
      </div>

      {/* Help overlay */}
      {helpOpen ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-[#0F1120]/60 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onClick={(e) => {
            if (e.target === e.currentTarget) setHelpOpen(false);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="font-display text-lg font-semibold">Keyboard shortcuts</h3>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label="Close help"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 px-6 py-5 text-sm">
              <Shortcut keys={['←', 'A', 'J']} label="Previous card" />
              <Shortcut keys={['→', 'D', 'K', '␣']} label="Next card" />
              <Shortcut keys={['Home']} label="First card" />
              <Shortcut keys={['End']} label="Last card" />
              <Shortcut keys={['1', '–', '9']} label="Jump to card" />
              <Shortcut keys={['P']} label="Toggle auto-advance" />
              <Shortcut keys={['?']} label="This help" />
              <Shortcut keys={['Esc']} label="Exit to ops dashboard" />
            </dl>
            <footer className="border-t border-border bg-muted/40 px-5 py-3 text-[11px] text-muted-foreground">
              Designed after Superhuman + Flipboard keyboard grammars.
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-foreground">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
          >
            {k}
          </kbd>
        ))}
      </span>
    </div>
  );
}
