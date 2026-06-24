/**
 * Client-side chat message model. Mirrors the backend ChatResponse shape but
 * flattened for render ergonomics (sql, sources, tables promoted to top-level
 * fields, timestamps attached, and a status enum for pending/error bubbles).
 */
export type ChatMessage =
  | {
      id: string;
      role: 'user';
      content: string;
      timestamp: string;
    }
  | {
      id: string;
      role: 'assistant';
      content: string;
      timestamp: string;
      status: 'ok' | 'pending' | 'error';
      sql?: string | null;
      tables?: string[];
      rowCount?: number | null;
      sources?: string[];
      followUps?: string[];
      question?: string;
    };
