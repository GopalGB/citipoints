'use client';

import { useMutation } from '@tanstack/react-query';
import { Moon, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { Badge } from '@/components/ui/badge';
import { NexusLoader } from '@/components/ui/nexus-loader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import type {
  CreativeAsset,
  CreativeChannel,
  CreativeLang,
  CreativeOccasion,
  CreativeRequest,
  CreativeResponse,
  CreativeSegment,
} from '@/lib/types';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';
import { cn } from '@/lib/utils';

const SEGMENTS: { value: CreativeSegment; label: string }[] = [
  { value: 'ramadan_shoppers', label: 'Ramadan Shoppers' },
  { value: 'gold_tier_moms', label: 'Gold-Tier Moms' },
  { value: 'silver_dads', label: 'Silver Dads' },
  { value: 'hibernating_whales', label: 'Hibernating Whales' },
  { value: 'lapsed_f&b', label: 'Lapsed F&B Redeemers' },
];

const OCCASIONS: { value: CreativeOccasion; label: string }[] = [
  { value: 'ramadan', label: 'Ramadan' },
  { value: 'eid_al_fitr', label: 'Eid al-Fitr' },
  { value: 'eid_al_adha', label: 'Eid al-Adha' },
  { value: 'national_day', label: 'UAE National Day' },
  { value: 'generic', label: 'Evergreen' },
];

const CHANNELS: { value: CreativeChannel; label: string }[] = [
  { value: 'push', label: 'Push notification' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'banner', label: 'In-app banner' },
  { value: 'email', label: 'Email' },
];

const LANGS: { value: CreativeLang; label: string }[] = [
  { value: 'ar', label: 'Arabic only' },
  { value: 'en', label: 'English only' },
  { value: 'both', label: 'Bilingual (AR + EN)' },
];

const FALLBACK_RESPONSE: CreativeResponse = {
  assets: [
    {
      channel: 'push',
      lang: 'ar',
      copy_headline: 'رمضانك أحلى مع بونز',
      copy_body:
        'من الإفطار للسحور، كل درهم تصرفه في شويترامز يرجعلك نقاط بونز — استبدلها ذهب من جويالوكاس أو تذاكر طيران.',
      cta: 'فعّل عرضك',
      imagery_prompt:
        'Traditional Emirati Iftar table at dusk: dates, Vimto, harees, lanterns, crescent moon. Nexus gold accent lighting. NO alcohol, NO pork.',
      persado_variants: [
        'رمضانك أحلى مع بونز — استفد من العرض',
        'آخر 24 ساعة: رمضانك أحلى مع بونز',
        'رمضانك أحلى مع بونز — خلي عيد عائلتك أحلى',
      ],
      brand_guardrail_passed: true,
    },
  ],
  hijri_context: {
    date: '23 Ramadan 1447',
    moon_day: 23,
    is_last_10_nights: true,
    notes: 'Layl al-Qadr window — peak spiritual engagement.',
  },
  compliance: {
    pdpl_safe: true,
    notes:
      'PDPL-safe: no member PII in copy. Cultural fit: Khaleeji dialect, no haram imagery.',
  },
  generation_time_ms: 0,
  model: 'fallback',
  source: 'fallback',
};

const VARIANT_LABELS = ['Functional', 'Urgent', 'Emotional'] as const;

export default function CreativePage() {
  const {
    timeWindow,
    setWindow,
    filters: windowFilters,
    anchor: dataAnchor,
  } = useWindowFilters('nexus:window:creative', 'all');

  const [segment, setSegment] = useState<CreativeSegment>('ramadan_shoppers');
  const [occasion, setOccasion] = useState<CreativeOccasion>('ramadan');
  const [channel, setChannel] = useState<CreativeChannel>('push');
  const [lang, setLang] = useState<CreativeLang>('both');

  const mutation = useMutation({
    mutationFn: (body: CreativeRequest) => api.creativeGenerate(body),
  });

  const response = mutation.data;
  const isError = mutation.isError;
  const renderResponse: CreativeResponse | null =
    response ?? (isError ? FALLBACK_RESPONSE : null);

  const subtitle = useMemo(() => {
    if (!renderResponse) {
      return 'Pick a segment and occasion — the agent drafts Khaleeji Arabic copy, an Ideogram imagery prompt, and three Persado-style tone variants in under a minute.';
    }
    const counts = renderResponse.assets.length;
    const passed = renderResponse.assets.filter((a) => a.brand_guardrail_passed).length;
    return `${counts} asset${counts === 1 ? '' : 's'} · ${passed}/${counts} passed the brand + cultural guardrail · ${(renderResponse.generation_time_ms / 1000).toFixed(1)}s end-to-end.`;
  }, [renderResponse]);

  const onGenerate = () => {
    mutation.mutate({ segment, occasion, channel, lang });
  };

  return (
    <div className="animate-fade-up space-y-6">
      <div className="sticky top-[64px] z-30 -mx-4 border-b border-border/60 bg-background/92 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Time window · {WINDOW_LABELS[timeWindow]}
          </span>
          <div className="flex flex-col items-end gap-1">
            <WindowSelector value={timeWindow} onChange={setWindow} />
            {dataAnchor && (
              <span className="text-[10px] font-medium text-muted-foreground">
                Anchored to <span className="font-mono text-foreground">{dataAnchor}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <DynamicBanner
        page="creative"
        filters={windowFilters}
        kicker="Ramadan Arabic Creative Agent"
        fallbackHeadline="Generate bilingual Ramadan campaigns in 20 seconds"
        fallbackSubtitle="A Claude-powered creative director. Khaleeji Arabic, RTL-ready, cultural guardrails baked in — plus the exact Ideogram prompt your design team can send to production."
        variant="light"
        polish
      />

      <p className="max-w-3xl rounded-md border border-[#F9C349]/30 bg-[#FDF5E0] px-3 py-2 text-xs text-[#6F4D0A]">
        <span className="font-semibold">Demo note:</span> imagery prompts are
        shown as text — we don&apos;t call Ideogram / Imagen from this screen.
        The agent returns everything a campaign manager needs to approve and
        ship: copy, CTA, imagery brief, and 3 tone variants.
      </p>

      {isError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Generation failed — showing template fallback so the pitch keeps
          moving. Check the API logs for the CLI error.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
        {/* ── Parameters ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-[#DA9712]" aria-hidden /> Brief
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ParamRow
              label="Segment"
              value={segment}
              onChange={(v) => setSegment(v as CreativeSegment)}
              options={SEGMENTS}
            />
            <ParamRow
              label="Occasion"
              value={occasion}
              onChange={(v) => setOccasion(v as CreativeOccasion)}
              options={OCCASIONS}
            />
            <ParamRow
              label="Channel"
              value={channel}
              onChange={(v) => setChannel(v as CreativeChannel)}
              options={CHANNELS}
            />
            <ParamRow
              label="Language"
              value={lang}
              onChange={(v) => setLang(v as CreativeLang)}
              options={LANGS}
            />
            <Button
              type="button"
              onClick={onGenerate}
              disabled={mutation.isPending}
              className="w-full bg-primary text-primary-foreground shadow-gold hover:bg-[#DA9712]"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {mutation.isPending ? 'Agent composing…' : 'Generate creative'}
            </Button>
          </CardContent>
        </Card>

        {/* ── Generated assets ──────────────────────────────────── */}
        <div className="space-y-4">
          {mutation.isPending && (
            <NexusLoader
              label="Agent composing Arabic creative"
              sublabel="Claude is drafting headline, body, CTA, imagery prompt, and three Persado variants."
              height={280}
            />
          )}
          {!mutation.isPending && !renderResponse && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Configure a brief on the left and hit{' '}
                <span className="font-semibold text-foreground">Generate creative</span>{' '}
                to see the agent&apos;s output.
              </CardContent>
            </Card>
          )}
          {!mutation.isPending &&
            renderResponse?.assets.map((asset, i) => (
              <AssetCard key={`${asset.channel}-${asset.lang}-${i}`} asset={asset} summary={subtitle} />
            ))}
        </div>

        {/* ── Context panel ─────────────────────────────────────── */}
        <Card className="self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Moon className="h-4 w-4 text-[#DA9712]" aria-hidden /> Hijri &amp; Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Hijri date
              </div>
              <div className="mt-1 font-display text-lg font-semibold">
                {renderResponse?.hijri_context.date ?? '—'}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="outline">
                  Moon day {renderResponse?.hijri_context.moon_day ?? '—'}
                </Badge>
                {renderResponse?.hijri_context.is_last_10_nights && (
                  <Badge variant="warning">Last 10 nights</Badge>
                )}
              </div>
              {renderResponse?.hijri_context.notes && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {renderResponse.hijri_context.notes}
                </p>
              )}
            </div>

            <div className="border-t border-border/70 pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Compliance
              </div>
              <div className="mt-1 flex items-center gap-2">
                <ShieldCheck
                  className={cn(
                    'h-4 w-4',
                    renderResponse?.compliance.pdpl_safe
                      ? 'text-emerald-600'
                      : 'text-rose-600',
                  )}
                  aria-hidden
                />
                <span className="text-sm">
                  {renderResponse?.compliance.pdpl_safe
                    ? 'PDPL safe'
                    : 'PDPL review required'}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {renderResponse?.compliance.notes ?? '—'}
              </p>
            </div>

            <div className="border-t border-border/70 pt-3 text-[11px] text-muted-foreground">
              Model{' '}
              <span className="font-mono text-foreground">
                {renderResponse?.model ?? '—'}
              </span>{' '}
              · source{' '}
              <span className="font-mono text-foreground">
                {renderResponse?.source ?? '—'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function ParamRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-sm">
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function AssetCard({ asset, summary }: { asset: CreativeAsset; summary: string }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [variantIdx, setVariantIdx] = useState(0);
  const isArabic = asset.lang === 'ar';
  const displayHeadline = asset.persado_variants[variantIdx] ?? asset.copy_headline;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2">
          <Badge variant={isArabic ? 'primary' : 'outline'}>
            {isArabic ? 'العربية · AR' : 'EN'}
          </Badge>
          <span className="text-sm font-medium capitalize text-muted-foreground">
            {asset.channel}
          </span>
        </CardTitle>
        {asset.brand_guardrail_passed ? (
          <Badge variant="success">
            <ShieldCheck className="h-3 w-3" aria-hidden /> Guardrail passed
          </Badge>
        ) : (
          <Badge variant="danger">Guardrail blocked</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Copy block */}
        <div
          dir={isArabic ? 'rtl' : 'ltr'}
          lang={isArabic ? 'ar' : 'en'}
          className={cn(
            'rounded-xl border border-border bg-muted/30 p-5',
            isArabic && 'arabic-rtl',
          )}
        >
          <h3
            className={cn(
              'text-2xl font-bold leading-tight text-foreground',
              isArabic ? 'text-right' : 'text-left',
            )}
          >
            {displayHeadline}
          </h3>
          <p
            className={cn(
              'mt-2 text-[15px] text-foreground/85',
              isArabic ? 'text-right' : 'text-left',
            )}
          >
            {asset.copy_body}
          </p>
          <div className={cn('mt-4 flex', isArabic ? 'justify-start' : 'justify-start')}>
            <span className="btn-gold">{asset.cta}</span>
          </div>
        </div>

        {/* Persado variants */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Persado tone
          </span>
          {VARIANT_LABELS.map((v, i) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariantIdx(i)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 transition-colors',
                i === variantIdx
                  ? 'border-[#F9C349] bg-[#FDF5E0] text-[#6F4D0A]'
                  : 'border-border bg-transparent text-muted-foreground hover:bg-muted',
              )}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Imagery prompt — collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setShowPrompt((s) => !s)}
            className="text-xs font-medium text-[#B4820E] hover:underline"
          >
            {showPrompt ? 'Hide' : 'Show'} Ideogram / Imagen prompt
          </button>
          {showPrompt && (
            <pre className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-[#F8F7F3] p-3 font-mono text-[11px] leading-relaxed text-foreground">
              {asset.imagery_prompt}
            </pre>
          )}
        </div>

        <div className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          {summary}
        </div>
      </CardContent>
    </Card>
  );
}
