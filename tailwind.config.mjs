/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Architect palette ──────────────────────────────────────
        // Core tokens point to CSS variables so they adapt with dark mode.
        // 400 stays static (opacity modifier /60 used in skeleton; CSS vars break that).
        arch: {
          bg:            'var(--color-bg)',
          surface:       'var(--color-surface)',
          'surface-raised': 'var(--color-surface-raised)',
          charcoal:      'var(--color-charcoal)',
          'charcoal-2':  'var(--color-charcoal-2)',
          accent:        'var(--color-accent)',
          'accent-dark': 'var(--color-accent-dark)',
          100:           'var(--color-border)',
          200:           'var(--color-border)',
          400:           '#9A9892',
          600:           'var(--color-muted-strong)',
          // Static dark-context values for explicit dark-surface usage
          'dark-bg':            '#111110',
          'dark-surface':       '#1A1918',
          'dark-surface-raised':'#222120',
          'dark-border':        '#2A2927',
        },
        // ── Keep brand/accent tokens — gameplay components use them ─
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        accent: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
        },
      },
      fontFamily: {
        sans:    ['Outfit', 'system-ui', 'sans-serif'],
        display: ['"Bebas Neue"', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        // Gameplay components use these — do not remove
        'card':    '0 1px 3px 0 rgb(0 0 0 / .08), 0 1px 2px -1px rgb(0 0 0 / .06)',
        'card-md': '0 4px 12px -2px rgb(0 0 0 / .10), 0 2px 6px -2px rgb(0 0 0 / .06)',
        'card-lg': '0 10px 30px -4px rgb(0 0 0 / .12), 0 4px 10px -4px rgb(0 0 0 / .07)',
        'glow':    '0 0 0 3px rgb(37 99 235 / .25)',
        'glow-sm': '0 0 0 2px rgb(37 99 235 / .20)',
        // Adaptive shadows — reference CSS vars that switch between light/dark values
        'adaptive':    'var(--shadow-card)',
        'adaptive-md': 'var(--shadow-card-md)',
        'adaptive-lg': 'var(--shadow-card-lg)',
      },
      backgroundImage: {
        // Keep for any gameplay/other pages that reference these
        'hero-gradient':      'linear-gradient(135deg, #eff6ff 0%, #f0f9ff 40%, #f5f3ff 100%)',
        'hero-gradient-dark': 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
        'cta-gradient':       'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
        'card-gradient':      'linear-gradient(135deg, #f8fafc 0%, #f0f9ff 100%)',
      },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'badge-pop': {
          '0%':   { transform: 'scale(0.85)', opacity: '0' },
          '70%':  { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
        'reveal': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'reveal-right': {
          from: { opacity: '0', transform: 'translateX(20px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in-up':    'fade-in-up 0.5s ease-out both',
        'badge-pop':     'badge-pop 0.4s ease-out both',
        'reveal':        'reveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
        'reveal-right':  'reveal-right 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
};
