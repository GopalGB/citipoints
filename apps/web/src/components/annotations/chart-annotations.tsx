'use client';

import { MessageSquare, Pin, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

type Annotation = {
  id: string;
  author: string;
  text: string;
  ts: string;
};

/**
 * Per-page annotations. Stored in localStorage (demo). A production version
 * would back this to an `annotations` table scoped by partner + page key.
 * Collaboration layer = "leave a sticky note on this chart".
 */
export function ChartAnnotations({ pageKey }: { pageKey: string }) {
  const storageKey = `nexus:annotations:${pageKey}`;
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState('');
  const [author, setAuthor] = useState('You');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setNotes(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const save = (next: Annotation[]) => {
    setNotes(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    const next: Annotation[] = [
      {
        id: `N-${Date.now()}`,
        author: author.trim() || 'You',
        text,
        ts: new Date().toISOString(),
      },
      ...notes,
    ];
    save(next);
    setDraft('');
  };

  const remove = (id: string) => {
    save(notes.filter((n) => n.id !== id));
  };

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-[#DA9712] text-white shadow-[0_10px_24px_rgba(218,151,18,0.45)] transition hover:bg-[#B4820E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F9C349]"
        aria-label={`Annotations — ${notes.length} notes`}
        title={`Annotations — ${notes.length} notes on this page`}
      >
        <MessageSquare className="h-5 w-5" />
        {notes.length > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {notes.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <aside
          role="complementary"
          aria-label="Page annotations"
          className="fixed bottom-20 right-5 z-50 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface shadow-pop"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-2">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6F4D0A]">
              <Pin className="h-3 w-3" /> Annotations · {pageKey}
            </p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Close annotations"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="max-h-[60vh] space-y-2 overflow-y-auto px-4 py-3">
            {notes.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No notes yet. Leave one for the board.
              </p>
            ) : (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-lg border border-border bg-[#FDFCF8] px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{n.author}</span>
                      <span>·</span>
                      <span>{new Date(n.ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      <button
                        type="button"
                        onClick={() => remove(n.id)}
                        className="ml-auto text-muted-foreground hover:text-rose-600"
                        aria-label="Delete note"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">{n.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 border-t border-border bg-muted/30 px-4 py-3">
            <input
              aria-label="Author"
              placeholder="Name"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-white px-2 text-xs focus:border-[#F9C349] focus:outline-none"
            />
            <textarea
              aria-label="Note text"
              placeholder="Add a note for the board…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-white px-2 py-1.5 text-sm focus:border-[#F9C349] focus:outline-none"
            />
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={submit} disabled={!draft.trim()}>
                Post note
              </Button>
            </div>
          </div>
        </aside>
      ) : null}
    </>
  );
}
