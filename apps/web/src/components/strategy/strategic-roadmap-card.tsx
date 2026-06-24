'use client';

import { Calendar, Flag, User } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { STRATEGIC_ROADMAP_DEMO } from '@/lib/demo-data';

const HORIZON_TONE: Record<string, string> = {
  'This quarter': 'bg-rose-100 text-rose-700',
  'Next quarter': 'bg-amber-100 text-amber-700',
  'Next half': 'bg-sky-100 text-sky-700',
};

/**
 * CEO-lens closer card. "What's next" — the strategic moves the board should
 * see at the bottom of the exec deck. Time-horizon color-coded.
 */
export function StrategicRoadmapCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Flag className="h-4 w-4 text-[#DA9712]" />
          Strategic roadmap · Q-on-Q
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          The next six moves. Colour-coded by horizon. Owner assigned.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border rounded-lg border border-border bg-white/60">
          {STRATEGIC_ROADMAP_DEMO.map((row, i) => (
            <li key={row.title} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span className="mt-0.5 font-mono text-xs text-muted-foreground">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-[240px]">
                <p className="text-sm font-semibold text-foreground">{row.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{row.note}</p>
              </div>
              <Badge className={HORIZON_TONE[row.horizon] ?? 'bg-muted text-foreground'}>
                <Calendar className="mr-1 h-3 w-3" />
                {row.horizon}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                <User className="mr-1 h-3 w-3" />
                {row.owner}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
