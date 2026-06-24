'use client';

import { MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UAE_EMIRATES } from '@/lib/demo-data';
import { formatAEDCompact } from '@/lib/format';

/**
 * Simple schematic SVG map of the 7 UAE emirates with store-revenue bubbles.
 * Not cartographically precise — it's a demo-grade glance card. A production
 * swap-in would use Leaflet or Mapbox GL with real emirate polygons.
 */
export function UaeGeoMap() {
  const [hover, setHover] = useState<string | null>(null);

  const max = Math.max(...UAE_EMIRATES.map((e) => e.revenue));
  const bubbles = useMemo(
    () =>
      UAE_EMIRATES.map((e) => ({
        ...e,
        radius: 6 + (e.revenue / max) * 28,
      })),
    [max],
  );

  const hovered = hover ? UAE_EMIRATES.find((e) => e.id === hover) : null;
  const total = UAE_EMIRATES.reduce((a, e) => a + e.revenue, 0);
  const dubaiShare = (UAE_EMIRATES.find((e) => e.id === 'dubai')!.revenue / total) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-[#DA9712]" />
          UAE — revenue by emirate
          <Badge variant="warning" className="ml-auto">
            Dubai: {dubaiShare.toFixed(0)}% of UAE revenue
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Bubble size ∝ 30-day AED revenue. Hover to inspect. Concentration risk: Dubai + Abu Dhabi dominate; Northern Emirates under-penetrated.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          {/* Map */}
          <div className="relative aspect-[5/4] w-full rounded-xl border border-border bg-[#0F1120]">
            <svg
              viewBox="0 0 100 80"
              className="h-full w-full"
              role="img"
              aria-label="UAE revenue by emirate"
            >
              {/* Gulf + Oman borders (schematic) */}
              <path
                d="M 0 40 Q 15 35, 35 45 T 70 55 L 80 55 L 85 40 L 75 20 L 60 10 L 40 15 L 20 25 L 0 30 Z"
                fill="#1b1f38"
                stroke="#F9C349"
                strokeOpacity={0.35}
                strokeWidth={0.4}
              />
              {/* Emirate labels (static, schematic) */}
              {bubbles.map((e) => {
                const isHover = hover === e.id;
                return (
                  <g
                    key={e.id}
                    onMouseEnter={() => setHover(e.id)}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      cx={e.x}
                      cy={e.y}
                      r={e.radius / 10}
                      fill="#F9C349"
                      fillOpacity={isHover ? 0.95 : 0.7}
                    />
                    <circle
                      cx={e.x}
                      cy={e.y}
                      r={e.radius / 10}
                      fill="transparent"
                      stroke="#F9C349"
                      strokeWidth={0.4}
                      strokeOpacity={isHover ? 1 : 0.4}
                    />
                    <text
                      x={e.x}
                      y={e.y - e.radius / 10 - 1.2}
                      textAnchor="middle"
                      fontSize={2.4}
                      fontWeight={600}
                      fill="#F9C349"
                    >
                      {e.name}
                    </text>
                  </g>
                );
              })}
              {/* Compass */}
              <g transform="translate(8 8)">
                <circle r={3} fill="#0F1120" stroke="#F9C349" strokeWidth={0.3} />
                <text y={-1.3} textAnchor="middle" fontSize={2.4} fill="#F9C349" fontWeight={700}>
                  N
                </text>
              </g>
            </svg>
          </div>

          {/* Right side: hover card + table */}
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-[#F9C349]/40 bg-[#FDF5E0] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B4820E]">
                {hovered ? 'Selected' : 'Hover an emirate'}
              </p>
              {hovered ? (
                <>
                  <p className="mt-1 font-display text-base font-semibold">{hovered.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {hovered.stores} stores ·{' '}
                    <span className="font-semibold text-foreground">
                      {formatAEDCompact(hovered.revenue)}
                    </span>{' '}
                    revenue (30d)
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Click or hover to see emirate-level detail.
                </p>
              )}
            </div>

            <ul className="space-y-1 text-xs">
              {[...UAE_EMIRATES]
                .sort((a, b) => b.revenue - a.revenue)
                .map((e) => {
                  const pct = (e.revenue / total) * 100;
                  return (
                    <li
                      key={e.id}
                      onMouseEnter={() => setHover(e.id)}
                      onMouseLeave={() => setHover(null)}
                      className={
                        'flex items-center gap-2 rounded-md px-2 py-1 transition ' +
                        (hover === e.id ? 'bg-[#FDF5E0]' : 'hover:bg-muted/30')
                      }
                    >
                      <span className="w-20 truncate font-medium">{e.name}</span>
                      <span className="tabular-nums text-muted-foreground">{e.stores}st</span>
                      <div className="flex-1">
                        <div className="h-1.5 rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-[#DA9712]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-14 text-right font-semibold tabular-nums">
                        {formatAEDCompact(e.revenue)}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>
        </div>

        <p className="mt-3 rounded-md bg-[#FDF5E0] px-3 py-2 text-xs text-[#6F4D0A]">
          <span className="font-semibold">Geo concentration risk:</span> Dubai + Abu Dhabi ={' '}
          {((UAE_EMIRATES.slice(0, 2).reduce((a, e) => a + e.revenue, 0) / total) * 100).toFixed(0)}% of UAE revenue. Northern Emirates (Umm Al Quwain, Fujairah, RAK) hold only ~3% — growth headroom if targeted.
        </p>
      </CardContent>
    </Card>
  );
}
