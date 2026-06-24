import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1440px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          foreground: 'hsl(var(--surface-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          foreground: 'hsl(var(--danger-foreground))',
        },
        // Actual Nexus brand tokens (sampled from nexusrewards.com)
        nexus: {
          cream: '#F8F7F3',        // Page background
          cream50: '#FDFCF8',      // Lighter cream
          navy: '#0F1120',         // Dark header/sidebar
          navySoft: '#1A1D33',     // Secondary dark
          gold: '#F9C349',         // Brand accent / CTA
          goldDark: '#DA9712',     // Hover / pressed gold
          goldSoft: '#FCE3A6',     // Gold tint for fills
          orange: '#F2714C',       // Pin orange
          orangeSoft: '#FFD8C9',   // Orange tint
          ink: '#0D0E14',          // Near-black text
          slate: '#6B6B6B',        // Muted text
          line: '#E8E5DC',         // Warm border
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui'],
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui'],
        mono: ['var(--font-mono)', 'ui-monospace'],
      },
      fontSize: {
        display: ['44px', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        xl: '16px',
        lg: '10px',
        md: '8px',
        sm: '6px',
      },
      boxShadow: {
        tile: '0 1px 2px rgba(13, 14, 20, 0.05), 0 2px 6px rgba(13, 14, 20, 0.06)',
        pop: '0 14px 34px rgba(13, 14, 20, 0.08), 0 4px 10px rgba(13, 14, 20, 0.05)',
        gold: '0 8px 24px rgba(249, 195, 73, 0.35)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200px 0' },
          '100%': { backgroundPosition: '200px 0' },
        },
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(249, 195, 73, 0.55)' },
          '50%': { boxShadow: '0 0 0 10px rgba(249, 195, 73, 0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 200ms ease-out both',
        shimmer: 'shimmer 1.2s linear infinite',
        'pulse-gold': 'pulse-gold 2.2s ease-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
