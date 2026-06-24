'use client';

import { ArrowUpRight, Sparkles } from 'lucide-react';

/**
 * Copilot hints — two render modes.
 *
 *  - "inline" (default): the compact follow-up rail that sits under an assistant
 *    message after a /chat answer. Small gold pill surface, 3-col on md+.
 *  - "rail": a collapsible sidebar skin used on the chat page to expose example
 *    prompts. Stacked vertically, wider padding, anchored to the chat shell.
 *
 * Both variants emit the same `onPick` contract so the composer can re-use them.
 */

const DEFAULT_HINTS: string[] = [
  'Show me which stores drove the highest Nexus issuance this week',
  'Compare Bahrain vs UAE member activation for Q2',
  'Which RFM segment has the biggest churn save-loop upside?',
];

export type CopilotHintsVariant = 'inline' | 'rail';

interface CopilotHintsProps {
  prompts?: string[];
  onPick?: (prompt: string) => void;
  variant?: CopilotHintsVariant;
  title?: string;
}

export function CopilotHints({
  prompts = DEFAULT_HINTS,
  onPick,
  variant = 'inline',
  title,
}: CopilotHintsProps) {
  if (variant === 'rail') {
    return (
      <aside
        aria-label={title ?? 'Suggested questions'}
        className="flex h-full flex-col gap-3 rounded-2xl border border-[#F9C349]/40 bg-gradient-to-br from-white to-[#FDF5E0]/60 p-4 shadow-tile"
      >
        <header className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#F9C349] to-[#DA9712] text-[#0F1120] shadow-[0_3px_10px_rgba(249,195,73,0.35)]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6F4D0A]">
              {title ?? 'Copilot hints'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Tap any prompt to drop it into the composer.
            </p>
          </div>
        </header>
        <ul className="flex flex-col gap-2">
          {prompts.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => onPick?.(p)}
                className="group flex w-full items-start justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2 text-left text-[13px] leading-snug transition hover:border-[#F9C349] hover:bg-[#FDF5E0]"
              >
                <span className="text-foreground">{p}</span>
                <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:text-[#DA9712]" />
              </button>
            </li>
          ))}
        </ul>
      </aside>
    );
  }

  return (
    <section
      aria-label="Suggested follow-up questions"
      className="rounded-xl border border-[#F9C349]/40 bg-[#FDF5E0]/70 px-4 py-3"
    >
      <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6F4D0A]">
        <Sparkles className="h-3 w-3" /> Try next
      </p>
      <ul className="grid gap-2 md:grid-cols-3">
        {prompts.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => onPick?.(p)}
              className="group flex h-full w-full items-start justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2 text-left text-sm transition hover:border-[#F9C349] hover:bg-[#FDF5E0]"
            >
              <span className="text-foreground">{p}</span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:text-[#DA9712]" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
