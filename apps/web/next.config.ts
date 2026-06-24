import type { NextConfig } from 'next';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // typedRoutes enforces literal href strings across the app. We keep it off
    // so the sidebar can iterate over a config-driven NAV_ITEMS array.
    typedRoutes: false,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_BASE}/api/:path*`,
      },
    ];
  },
  async redirects() {
    // 2026-04-27 — Arjit's "too much, dial it down" call. The simple
    // Boardroom home is at "/", and ANY visit to the heavy /executive
    // Pro suite bounces back to "/". Server-level 307 (more reliable
    // than next/navigation redirect() under Turbopack).
    return [
      {
        source: '/executive',
        destination: '/',
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
        ],
      },
    ];
  },
};

export default config;
