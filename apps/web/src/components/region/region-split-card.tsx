'use client';

import { Flag, MapPin, Store, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { REGION_SPLIT_DEMO } from '@/lib/demo-data';
import { formatAEDCompact, formatCompact, formatPct } from '@/lib/format';

const { uae, bahrain, comparison } = REGION_SPLIT_DEMO;

/**
 * Side-by-side UAE vs Bahrain with the headline comparison.
 * Matches the Nov-2025 Bahrain expansion story: 80K week-1 signups with
 * +38% day-30 active rate vs UAE baseline.
 */
export function RegionSplitCard() {
  const uaeAedPerMember = uae.revenue_last_30d / uae.members;
  const bhdAedPerMember = bahrain.revenue_last_30d / bahrain.members;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Flag className="h-4 w-4 text-[#DA9712]" />
          Bahrain vs UAE — regional split
          <Badge variant="success" className="ml-auto">
            Bahrain day-30 active +{((comparison.day_30_activation_bahrain - comparison.day_30_activation_uae_avg) * 100).toFixed(0)} pp
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{comparison.takeaway}</p>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <RegionBlock
          flag="🇦🇪"
          name="UAE"
          launched={uae.launched}
          members={uae.members}
          revenue={uae.revenue_last_30d}
          activeRate={uae.active_rate}
          aedPerMember={uaeAedPerMember}
          stores={uae.stores}
          day30={comparison.day_30_activation_uae_avg}
        />
        <RegionBlock
          flag="🇧🇭"
          name="Bahrain"
          launched={bahrain.launched}
          members={bahrain.members}
          revenue={bahrain.revenue_last_30d}
          activeRate={bahrain.active_rate}
          aedPerMember={bhdAedPerMember}
          stores={bahrain.stores}
          day30={comparison.day_30_activation_bahrain}
          accent
        />
      </CardContent>
    </Card>
  );
}

function RegionBlock({
  flag,
  name,
  launched,
  members,
  revenue,
  activeRate,
  aedPerMember,
  stores,
  day30,
  accent,
}: {
  flag: string;
  name: string;
  launched: string;
  members: number;
  revenue: number;
  activeRate: number;
  aedPerMember: number;
  stores: number;
  day30: number;
  accent?: boolean;
}) {
  return (
    <div
      className={
        'rounded-xl border p-4 ' +
        (accent
          ? 'border-[#F9C349] bg-gradient-to-br from-[#FDF5E0]/70 to-[#FFF]'
          : 'border-border bg-muted/20')
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="text-2xl leading-none" aria-hidden>
          {flag}
        </span>
        <div className="flex-1">
          <p className="font-display text-lg font-semibold text-foreground">{name}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Launched {launched}
          </p>
        </div>
        {accent ? <Badge className="bg-[#F9C349] text-[#0F1120]">New market</Badge> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Stat icon={Users} label="Members" value={formatCompact(members)} />
        <Stat icon={Store} label="Stores" value={`${stores}`} />
        <Stat icon={MapPin} label="30-d revenue" value={formatAEDCompact(revenue)} />
        <Stat icon={Users} label="Active rate" value={formatPct(activeRate * 100, 0)} />
      </div>
      <div className="mt-3 rounded-md border border-border bg-white px-3 py-2 text-[11px]">
        <p className="flex items-baseline justify-between">
          <span className="text-muted-foreground">AED / member / month</span>
          <span className="font-semibold tabular-nums">{aedPerMember.toFixed(2)}</span>
        </p>
        <p className="mt-1 flex items-baseline justify-between">
          <span className="text-muted-foreground">Day-30 activation</span>
          <span className="font-semibold tabular-nums">{formatPct(day30 * 100, 0)}</span>
        </p>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-white/70 px-2 py-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      <div className="flex-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
