'use client';

import { ArrowUpRight, Sparkles } from 'lucide-react';

interface EmptyStateProps {
  prompts: string[];
  onPick: (prompt: string) => void;
}

/**
 * Welcoming first-run panel. Shown before the user has sent anything.
 * Offers 4 clickable starter chips that prefill the composer (and fire).
 */
export function ChatEmptyState({ prompts, onPick }: EmptyStateProps) {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-6 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F9C349] to-[#DA9712] text-[#0F1120] shadow-gold">
        <Sparkles className="h-7 w-7" aria-hidden />
      </div>
      <div className="space-y-2">
        <h2 className="font-display text-2xl font-semibold text-foreground">
          What do you want to know about Nexus?
        </h2>
        <p className="max-w-xl text-sm text-muted-foreground">
          Ask in plain English. Every answer is grounded in the warehouse
          snapshot and ships with the SQL an analyst would have run — click
          &ldquo;How I got this&rdquo; on any reply to audit the source.
        </p>
      </div>
      <ul className="grid w-full gap-2 sm:grid-cols-2">
        {prompts.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              onClick={() => onPick(prompt)}
              className="group flex h-full w-full items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 text-left text-sm shadow-tile transition hover:border-[#F9C349] hover:bg-[#FDF5E0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <span className="text-foreground">{prompt}</span>
              <ArrowUpRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-[#DA9712]"
              />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        Tip: press{' '}
        <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>{' '}
        anytime to jump to the composer.
      </p>
    </div>
  );
}
