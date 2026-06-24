'use client';

import { useMemo } from 'react';

import type { FraudRing } from '@/lib/types';

type Node = {
  id: string;
  kind: 'member' | 'merchant';
  x: number;
  y: number;
  label: string;
};

type Edge = { source: string; target: string; weight: number };

/**
 * Pure-SVG force-directed-ish ring graph. We position members evenly around
 * an outer circle and merchants around an inner circle, then draw weighted
 * edges between them. This avoids a heavy dep (react-force-graph-2d pulls
 * in three.js) while still giving the loyalty manager a legible ring view.
 */
export function RingGraph({ ring, width = 520, height = 320 }: { ring: FraudRing; width?: number; height?: number }) {
  const { nodes, edges } = useMemo(() => buildLayout(ring, width, height), [ring, width, height]);

  if (!nodes.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
        No graph data for this ring.
      </div>
    );
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={`Fraud ring graph ${ring.ring_id}`}
    >
      {/* edges */}
      {edges.map((e, i) => {
        const src = nodeById.get(e.source);
        const tgt = nodeById.get(e.target);
        if (!src || !tgt) return null;
        const strokeWidth = Math.max(0.8, Math.min(3.2, Math.log2(e.weight + 1)));
        return (
          <line
            key={`e-${i}`}
            x1={src.x}
            y1={src.y}
            x2={tgt.x}
            y2={tgt.y}
            stroke="#C5C2B6"
            strokeOpacity={0.6}
            strokeWidth={strokeWidth}
          />
        );
      })}

      {/* nodes */}
      {nodes.map((n) => {
        const isMember = n.kind === 'member';
        return (
          <g key={n.id}>
            {isMember ? (
              <circle cx={n.x} cy={n.y} r={10} fill="#F9C349" stroke="#0F1120" strokeWidth={1.2} />
            ) : (
              <rect
                x={n.x - 10}
                y={n.y - 10}
                width={20}
                height={20}
                rx={3}
                fill="#4B4F73"
                stroke="#0F1120"
                strokeWidth={1.2}
              />
            )}
            <text
              x={n.x}
              y={n.y + (isMember ? 22 : 24)}
              fontSize={9}
              textAnchor="middle"
              fill="#1A1D33"
            >
              {truncate(n.label, 18)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function buildLayout(ring: FraudRing, width: number, height: number): { nodes: Node[]; edges: Edge[] } {
  const cx = width / 2;
  const cy = height / 2;
  const outerR = Math.min(width, height) / 2 - 40;
  const innerR = Math.max(40, outerR / 2.2);
  const members = ring.members.slice(0, 12);
  const merchants = ring.merchants.slice(0, 6);

  const nodes: Node[] = [];
  members.forEach((m, i) => {
    const angle = (i / Math.max(members.length, 1)) * Math.PI * 2 - Math.PI / 2;
    nodes.push({
      id: `m:${m.member_id}`,
      kind: 'member',
      x: cx + Math.cos(angle) * outerR,
      y: cy + Math.sin(angle) * outerR,
      label: m.masked_name,
    });
  });
  merchants.forEach((s, i) => {
    const angle = (i / Math.max(merchants.length, 1)) * Math.PI * 2;
    nodes.push({
      id: `s:${s.merchant}`,
      kind: 'merchant',
      x: cx + Math.cos(angle) * innerR,
      y: cy + Math.sin(angle) * innerR,
      label: s.merchant,
    });
  });

  // Connect every member to every merchant with weight proportional to txn count.
  const edges: Edge[] = [];
  for (const m of members) {
    for (const s of merchants) {
      edges.push({ source: `m:${m.member_id}`, target: `s:${s.merchant}`, weight: s.txn_count || 1 });
    }
  }
  return { nodes, edges };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
