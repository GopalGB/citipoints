'use client';

import { useQuery } from '@tanstack/react-query';
import { sankey, sankeyLinkHorizontal, sankeyLeft, sankeyRight } from 'd3-sankey';
import type { SankeyGraph } from 'd3-sankey';
import { Network, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ChartShell } from '@/components/charts/chart-shell';
import { WindowSelector } from '@/components/exec/cxo-dashboard';
import { DynamicBanner } from '@/components/insights/dynamic-banner';
import { Badge } from '@/components/ui/badge';
import { NexusLoader } from '@/components/ui/nexus-loader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatAEDCompact } from '@/lib/format';
import type { SankeyLink, SankeyNode } from '@/lib/types';
import { useWindowFilters, WINDOW_LABELS } from '@/lib/window';

interface D3Node extends SankeyNode {
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  value?: number;
}

interface D3Link {
  source: D3Node | string;
  target: D3Node | string;
  value: number;
  value_aed: number;
  width?: number;
  y0?: number;
  y1?: number;
}

const SANKEY_WIDTH = 880;
const SANKEY_HEIGHT = 520;
const GRADIENT_ID = 'nexus-gold-gradient';

export default function CoalitionFlowPage() {
  const {
    timeWindow,
    setWindow,
    filters: windowFilters,
    anchor: dataAnchor,
  } = useWindowFilters('nexus:window:coalition-flow', 'all');

  const flowQuery = useQuery({
    queryKey: ['coalition-flow', timeWindow, windowFilters.date_from, windowFilters.date_to],
    queryFn: () => api.coalitionFlow(windowFilters),
  });

  const data = flowQuery.data;
  const hasData = !!data && data.nodes.length > 0 && data.links.length > 0;

  const fallbackHeadline = hasData
    ? `AED ${formatAEDCompact(data.total_aed).replace('AED ', '')} of Nexus redeemed across ${data.earn_partner_count} earning × ${data.redeem_partner_count} redeeming partners`
    : 'Earn → Redeem coalition flow';
  const fallbackSubtitle =
    'Ribbons map the AED value of Nexus from every earning partner to every redeeming partner in the window. Thick gold bands = net point sinks; thin bands = partners that earn more than they burn.';

  return (
    <div className="animate-fade-up space-y-6">
      {/* Sticky window toolbar (copied pattern from market-basket) */}
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
        page="coalition-flow"
        filters={windowFilters}
        kicker="Coalition health · Earn → Redeem"
        fallbackHeadline={fallbackHeadline}
        fallbackSubtitle={fallbackSubtitle}
        polish
      />

      <ChartShell
        id="coalition-sankey"
        title="Earn → Redeem Sankey"
        description="Left: top earning partners (where Nexus are issued). Right: top redeeming partners (where Nexus are burnt). Ribbon thickness ∝ AED value. Hover any ribbon to inspect the flow."
        height="auto"
      >
        {flowQuery.isLoading ? (
          <div className="flex h-[520px] items-center justify-center">
            <NexusLoader label="Tracing coalition flows…" />
          </div>
        ) : flowQuery.isError ? (
          <div className="p-6 text-sm text-rose-700">
            Failed to load coalition flow. Check the API is reachable.
          </div>
        ) : !hasData ? (
          <div className="p-6 text-sm text-muted-foreground">
            No earn/redeem activity in this window. Switch to a longer window to surface flow.
          </div>
        ) : (
          <SankeyDiagram nodes={data.nodes} links={data.links} />
        )}
      </ChartShell>

      {hasData ? (
        <p className="max-w-3xl rounded-md border border-[#F9C349]/30 bg-[#FDF5E0] px-3 py-2 text-xs text-[#6F4D0A]">
          <span className="font-semibold">What this means:</span> AED{' '}
          {formatAEDCompact(data.total_aed).replace('AED ', '')} flowed from{' '}
          {data.earn_partner_count} earning partners to {data.redeem_partner_count} redeeming
          partners. Earn/redeem asymmetry highlights partners that are net point sinks — those
          with thick inbound ribbons but thin outbound ones carry disproportionate IFRS 15
          liability.
        </p>
      ) : null}

      {/* Top-flow table for pixel-precise reading */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-[#DA9712]" /> Top 12 flow edges
          </CardTitle>
        </CardHeader>
        <CardContent>
          {flowQuery.isLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : !hasData ? (
            <p className="text-sm text-muted-foreground">No flows to rank.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Earn partner</TableHead>
                  <TableHead>Redeem partner</TableHead>
                  <TableHead className="text-right">AED</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...data.links]
                  .sort((a, b) => b.value_aed - a.value_aed)
                  .slice(0, 12)
                  .map((link) => {
                    const src = data.nodes.find((n) => n.id === link.source);
                    const tgt = data.nodes.find((n) => n.id === link.target);
                    const sameName = src?.name === tgt?.name;
                    return (
                      <TableRow key={`${link.source}-${link.target}`}>
                        <TableCell className="font-medium">{src?.name ?? link.source}</TableCell>
                        <TableCell className="font-medium">
                          {tgt?.name ?? link.target}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatAEDCompact(link.value_aed)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={sameName ? 'default' : 'success'}>
                            {sameName ? 'Same partner' : 'Cross-partner'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SankeyDiagram({
  nodes,
  links,
}: {
  nodes: SankeyNode[];
  links: SankeyLink[];
}) {
  const [hoverLink, setHoverLink] = useState<{
    source: string;
    target: string;
    value_aed: number;
    x: number;
    y: number;
  } | null>(null);

  const layout = useMemo(() => {
    // d3-sankey mutates input; give it fresh arrays.
    const nodesCopy: D3Node[] = nodes.map((n) => ({ ...n }));
    const linksCopy: D3Link[] = links.map((l) => ({
      source: l.source,
      target: l.target,
      value: l.value_aed,
      value_aed: l.value_aed,
    }));

    const generator = sankey<D3Node, D3Link>()
      .nodeId((n) => n.id)
      .nodeAlign((node) => (node.side === 'earn' ? sankeyLeft(node, 0) : sankeyRight(node, 0)))
      .nodeWidth(16)
      .nodePadding(12)
      .extent([
        [160, 20],
        [SANKEY_WIDTH - 160, SANKEY_HEIGHT - 20],
      ]);

    const graph: SankeyGraph<D3Node, D3Link> = generator({
      nodes: nodesCopy,
      links: linksCopy,
    });
    return graph;
  }, [nodes, links]);

  const linkPath = sankeyLinkHorizontal<D3Node, D3Link>();

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${SANKEY_WIDTH} ${SANKEY_HEIGHT}`}
        className="mx-auto block h-auto w-full max-w-[960px]"
        role="img"
        aria-label="Earn to Redeem coalition flow"
      >
        <defs>
          <linearGradient id={GRADIENT_ID} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F9C349" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#DA9712" stopOpacity={0.9} />
          </linearGradient>
        </defs>

        {/* Column labels */}
        <text
          x={168}
          y={14}
          textAnchor="start"
          fontSize={11}
          fontWeight={700}
          fill="#DA9712"
        >
          EARN
        </text>
        <text
          x={SANKEY_WIDTH - 168}
          y={14}
          textAnchor="end"
          fontSize={11}
          fontWeight={700}
          fill="#DA9712"
        >
          REDEEM
        </text>

        {/* Links */}
        <g fill="none" stroke={`url(#${GRADIENT_ID})`} strokeOpacity={0.55}>
          {layout.links.map((link, i) => {
            const path = linkPath(link) ?? '';
            const src = typeof link.source === 'string' ? link.source : link.source.id;
            const tgt = typeof link.target === 'string' ? link.target : link.target.id;
            const isHover =
              hoverLink && hoverLink.source === src && hoverLink.target === tgt;
            return (
              <path
                key={`${src}-${tgt}-${i}`}
                d={path}
                strokeWidth={Math.max(1, link.width ?? 1)}
                strokeOpacity={isHover ? 0.9 : 0.5}
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGPathElement).getBoundingClientRect();
                  const parent = (
                    e.currentTarget.ownerSVGElement?.parentElement as HTMLElement
                  )?.getBoundingClientRect();
                  setHoverLink({
                    source: src,
                    target: tgt,
                    value_aed: link.value_aed,
                    x: rect.left - (parent?.left ?? 0) + rect.width / 2,
                    y: rect.top - (parent?.top ?? 0) + rect.height / 2,
                  });
                }}
                onMouseLeave={() => setHoverLink(null)}
              >
                <title>
                  {typeof link.source === 'object' ? link.source.name : src} →{' '}
                  {typeof link.target === 'object' ? link.target.name : tgt}:{' '}
                  {formatAEDCompact(link.value_aed)}
                </title>
              </path>
            );
          })}
        </g>

        {/* Nodes */}
        <g>
          {layout.nodes.map((node) => {
            const x = node.x0 ?? 0;
            const y = node.y0 ?? 0;
            const w = (node.x1 ?? x) - x;
            const h = Math.max(2, (node.y1 ?? y) - y);
            const isEarn = node.side === 'earn';
            const labelX = isEarn ? x - 8 : x + w + 8;
            const anchor = isEarn ? 'end' : 'start';
            return (
              <g key={node.id}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill="#0F1120"
                  rx={2}
                >
                  <title>
                    {node.name} — {formatAEDCompact(node.value ?? 0)}
                  </title>
                </rect>
                <text
                  x={labelX}
                  y={y + h / 2}
                  textAnchor={anchor}
                  alignmentBaseline="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill="#0F1120"
                >
                  {node.name}
                </text>
                <text
                  x={labelX}
                  y={y + h / 2 + 14}
                  textAnchor={anchor}
                  alignmentBaseline="middle"
                  fontSize={10}
                  fill="#6b7280"
                >
                  {formatAEDCompact(node.value ?? 0)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {hoverLink ? (
        <div
          className="pointer-events-none absolute z-20 rounded-md border border-[#F9C349]/50 bg-[#0F1120] px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: hoverLink.x + 8, top: hoverLink.y - 40 }}
        >
          <div className="font-semibold">
            {nodes.find((n) => n.id === hoverLink.source)?.name} →{' '}
            {nodes.find((n) => n.id === hoverLink.target)?.name}
          </div>
          <div className="text-[#F9C349]">{formatAEDCompact(hoverLink.value_aed)}</div>
        </div>
      ) : null}
    </div>
  );
}
