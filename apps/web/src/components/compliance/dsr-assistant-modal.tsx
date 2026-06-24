'use client';

import { Check, Copy, RefreshCw, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type DsrKind = 'access' | 'rectification' | 'erasure' | 'portability';

const KIND_LABEL: Record<DsrKind, string> = {
  access: 'Access (Art. 13)',
  rectification: 'Rectification (Art. 14)',
  erasure: 'Erasure (Art. 15)',
  portability: 'Portability (Art. 16)',
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function DsrAssistantModal({ open, onClose }: Props) {
  const [kind, setKind] = useState<DsrKind>('access');
  const [memberName, setMemberName] = useState('M. Ahmed');
  const [memberId, setMemberId] = useState('C-91241');
  const [copied, setCopied] = useState(false);
  const [regen, setRegen] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const draft = useMemo(
    () => buildDraft(kind, memberName.trim() || 'Member', memberId.trim() || 'C-XXXXX', regen),
    [kind, memberName, memberId, regen],
  );

  const copy = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0F1120]/55 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="DSR assistant"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
        <header className="flex items-start justify-between gap-3 border-b border-border bg-nexus-navy px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F9C349]">
              <Sparkles className="h-3 w-3" /> PDPL DSR assistant
            </p>
            <h2 className="mt-0.5 font-display text-lg font-semibold">Draft Data Subject Request response</h2>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="Close"
            className="text-white hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="space-y-4 p-5">
          {/* Kind chips */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Request type
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(KIND_LABEL) as DsrKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={
                    'rounded-full border px-3 py-1 text-xs font-medium transition ' +
                    (kind === k
                      ? 'border-[#DA9712] bg-[#FDF5E0] text-[#6F4D0A]'
                      : 'border-border bg-white hover:bg-muted')
                  }
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          {/* Member input */}
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">Member name</span>
              <input
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm focus:border-[#F9C349] focus:outline-none"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">Member ID</span>
              <input
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-white px-2 font-mono text-sm focus:border-[#F9C349] focus:outline-none"
              />
            </label>
          </div>

          {/* Draft */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                AI-drafted response
              </p>
              <Badge variant="outline" className="text-[10px]">
                Claude Sonnet · PDPL-aware prompt
              </Badge>
            </div>
            <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-muted/20 px-4 py-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-foreground">
              {draft}
            </pre>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={() => setRegen((k) => k + 1)}>
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </Button>
            <Button type="button" size="sm" onClick={copy}>
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy draft
                </>
              )}
            </Button>
            <p className="ml-auto text-[11px] text-muted-foreground">
              SLA 30d · PDPL Art. 13
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildDraft(kind: DsrKind, name: string, id: string, salt: number): string {
  const today = new Date().toISOString().slice(0, 10);
  const intros = [
    `Dear ${name},`,
    `Hello ${name},`,
    `${name},`,
  ];
  const intro = intros[salt % intros.length]!;

  const base = `${intro}

Thank you for your ${KIND_LABEL[kind]} request under the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021).

We have located your records under member ID ${id}. Below is our response:`;

  const body: Record<DsrKind, string> = {
    access: `
• Member profile: name, email, mobile (hashed), tier, signup date.
• Transaction history: 90-day rolling copy attached as CSV.
• Nexus ledger: issued, redeemed, outstanding, projected expiry windows.
• Marketing consent: active / inactive flags with last-change timestamp.
• Processing activities register: attached as PDF (subprocessor list included).

Your data is hosted in UAE (AWS me-central-1) with a replica in Bahrain (me-south-1). No data is transferred outside the GCC.`,

    rectification: `
We have queued the requested correction for review. Our data team will verify source-of-truth via two independent signals (transaction history + KYC record on file) before applying the change, to prevent account-takeover risk.

Estimated completion: 7 business days. You will receive an email confirmation once the update is live across all Nexus systems (including coalition partner read replicas).`,

    erasure: `
Your erasure request will be processed subject to the following retention obligations (UAE Federal audit + IFRS 15):
• Transactional records: retained for 7 years from last transaction (legal obligation).
• Marketing profile + non-transactional preferences: erased within 30 days.
• Outstanding Nexus balance: redeemed, converted to AED credit, or voided per your preference. Please confirm which.

Once erasure is applied, your member ID will be anonymized to a hash in downstream analytics. Nexus will no longer contact you under this ID.`,

    portability: `
Attached is your portable data pack in machine-readable JSON and CSV formats:
• member_profile.json
• transactions_90d.csv
• nexus_ledger.csv
• consent_history.csv
• preferences.json

All files are UTF-8 encoded and conform to UAE PDPL portability guidelines. You may use these directly with any GCC-regulated loyalty program that accepts standardized portability formats.`,
  };

  const tail = `

Estimated resolution by: ${new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)} (well inside PDPL 30-day SLA from ${today}).

If you have questions, reply to this email or call our DPO on +971 4 000 0000.

Kind regards,
Nexus Data Protection Office
dpo@nexus.ae`;

  return `${base}${body[kind]}${tail}`;
}
