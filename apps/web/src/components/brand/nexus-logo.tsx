
import { cn } from '@/lib/utils';

type Size = 'xs' | 'sm' | 'md' | 'lg';

const MARK_PX: Record<Size, number> = { xs: 20, sm: 24, md: 32, lg: 48 };

interface Props {
  size?: Size;
  variant?: 'onDark' | 'onLight';
  className?: string;
  priority?: boolean;
}

/**
 * Official Nexus wordmark (white) + orange-teardrop pin with yellow coin.
 * Original logo is white, so default variant assumes a dark surface.
 * Use variant="onLight" to render the iconmark alone (teardrop only) on light bg.
 */
export function NexusLogo({
  size = 'md',
  variant = 'onDark',
  className,
  priority = false,
}: Props) {


  if (variant === 'onLight') {
    return (
      <span
        className={cn('inline-flex items-center gap-2 select-none', className)}
        role="img"
        aria-label="Nexus"
      >
        <NexusMark size={MARK_PX[size]} />
        <span
          className={cn(
            'font-display font-extrabold tracking-tight text-nexus-ink',
            size === 'xs' && 'text-sm',
            size === 'sm' && 'text-base',
            size === 'md' && 'text-xl',
            size === 'lg' && 'text-3xl',
          )}
          style={{ letterSpacing: '0.04em' }}
        >
          Nexus
        </span>
      </span>
    );
  }

  // Text + SVG wordmark (white) — no raster brand asset, so the repo ships no
  // real client logo. Mirrors the onLight branch but tuned for a dark surface.
  void priority;
  return (
    <span
      className={cn('inline-flex items-center gap-2 select-none', className)}
      role="img"
      aria-label="Nexus — loyalty rewards"
    >
      <NexusMark size={MARK_PX[size]} />
      <span
        className={cn(
          'font-display font-extrabold tracking-tight text-white',
          size === 'xs' && 'text-sm',
          size === 'sm' && 'text-base',
          size === 'md' && 'text-xl',
          size === 'lg' && 'text-3xl',
        )}
        style={{ letterSpacing: '0.04em' }}
      >
        Nexus
      </span>
    </span>
  );
}

/**
 * Teardrop pin with yellow coin — the Nexus iconmark.
 * Rebuilt as inline SVG so it renders crisp on any background (including cream).
 */
export function NexusMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="nexus-pin" x1="8" y1="4" x2="32" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F58A63" />
          <stop offset="0.55" stopColor="#F2714C" />
          <stop offset="1" stopColor="#D85A38" />
        </linearGradient>
        <linearGradient id="nexus-coin" x1="14" y1="14" x2="26" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FDE08C" />
          <stop offset="1" stopColor="#F9C349" />
        </linearGradient>
      </defs>
      {/* Teardrop pin */}
      <path
        d="M20 2.5c-8.56 0-15.5 6.94-15.5 15.5 0 10.6 13.04 24.5 14.14 25.66a1.88 1.88 0 0 0 2.72 0C22.46 42.5 35.5 28.6 35.5 18c0-8.56-6.94-15.5-15.5-15.5Z"
        fill="url(#nexus-pin)"
      />
      {/* Inner white ring — hole in the "O" shape */}
      <circle cx="20" cy="18" r="8.5" fill="#FFFFFF" />
      {/* Gold coin center */}
      <circle cx="20" cy="18" r="5" fill="url(#nexus-coin)" />
    </svg>
  );
}

/**
 * Parent-platform attribution used in header/footer.
 * Reinforces hierarchy — Nexus (consumer) · CITI Points (parent platform).
 */
export function PoweredByCiti({
  className,
  variant = 'onDark',
}: {
  className?: string;
  variant?: 'onDark' | 'onLight';
}) {
  const onDark = variant === 'onDark';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] font-medium',
        onDark ? 'text-white/70' : 'text-muted-foreground',
        className,
      )}
    >
      <span className="hidden sm:inline">Powered by</span>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]',
          onDark
            ? 'border border-white/20 bg-white/5 text-white'
            : 'border border-border bg-surface text-foreground',
        )}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="5" cy="5" r="1.4" fill="currentColor" />
        </svg>
        CITI Points
      </span>
    </span>
  );
}
