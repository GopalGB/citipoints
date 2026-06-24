import './globals.css';

import type { Metadata, Viewport } from 'next';
import { Karla, Work_Sans } from 'next/font/google';

import { ConditionalCopilot } from '@/components/ai-copilot/conditional-copilot';
import { AppShell } from '@/components/shell/app-shell';
import { Providers } from '@/components/providers';

// Body copy — Karla (matches nexusrewards.com)
const karla = Karla({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

// Display / headings — Work Sans (matches nexusrewards.com)
const workSans = Work_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexus-analytics.local';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Nexus Partner Analytics — Powered by CITI Points',
    template: '%s · Nexus Partner Analytics',
  },
  description:
    'Nexus partner analytics — reporting, customer segments, churn, recommendations, and AI chat for Acme Retail and 35+ coalition partners across the UAE and Bahrain. Powered by CITI Points Loyalty Card Services LLC.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Nexus Partner Analytics — Powered by CITI Points',
    description:
      'Reporting · analytical models · AI chat for the Nexus coalition loyalty program. All Rewards. One App.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8F7F3' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1120' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${karla.variable} ${workSans.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground focus:shadow-gold"
        >
          Skip to content
        </a>
        <Providers>
          <AppShell>
            <div id="main-content">{children}</div>
          </AppShell>
          <ConditionalCopilot />
        </Providers>
      </body>
    </html>
  );
}
