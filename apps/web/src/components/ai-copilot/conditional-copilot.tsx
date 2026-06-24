'use client';

import { usePathname } from 'next/navigation';

import { AiCopilot } from './ai-copilot';

/**
 * Mounts the floating AI Copilot on every Pro route, but hides it on the
 * old-school exec home (`/`). Per Arjit's coaching call (2026-04-26): the
 * default landing view should read as Tableau-style boring-on-purpose, with
 * no AI surfaces. The copilot stays available on /executive and all 30 Pro
 * routes — the home page just opts out.
 */
const SIMPLE_ROUTES = ['/', '/customers', '/partners', '/category', '/stores', '/bundles', '/outlook'];

export function ConditionalCopilot() {
  const pathname = usePathname();
  if (SIMPLE_ROUTES.includes(pathname)) return null;
  return <AiCopilot />;
}
