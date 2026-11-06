import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ReachInbox brand palette
        brand: {
          50:  '#f0f4ff',
          100: '#e0e9ff',
          200: '#c7d6fe',
          300: '#a5b8fc',
          400: '#8191f8',
          500: '#6366f1', // primary
          600: '#4f46e5',
          700: '#4038ca',
          800: '#3630a3',
          900: '#312e81',
        },
        surface: '#0f0f17',
        'surface-2': '#16161f',
        'surface-3': '#1e1e2a',
        border: '#2a2a3a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        lg: '0.625rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
    },
  },
  plugins: [],
};

export default config;
