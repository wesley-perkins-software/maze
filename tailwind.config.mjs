/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
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
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card':    '0 1px 3px 0 rgb(0 0 0 / .08), 0 1px 2px -1px rgb(0 0 0 / .06)',
        'card-md': '0 4px 12px -2px rgb(0 0 0 / .10), 0 2px 6px -2px rgb(0 0 0 / .06)',
        'card-lg': '0 10px 30px -4px rgb(0 0 0 / .12), 0 4px 10px -4px rgb(0 0 0 / .07)',
        'glow':    '0 0 0 3px rgb(37 99 235 / .25)',
        'glow-sm': '0 0 0 2px rgb(37 99 235 / .20)',
      },
      backgroundImage: {
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
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.5s ease-out both',
        'badge-pop':  'badge-pop 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};
