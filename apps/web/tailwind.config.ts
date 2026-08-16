import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--surface-muted) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        signal: {
          blue: 'rgb(var(--signal-blue) / <alpha-value>)',
          cyan: 'rgb(var(--signal-cyan) / <alpha-value>)',
          amber: 'rgb(var(--signal-amber) / <alpha-value>)',
        },
        market: {
          up: 'rgb(var(--market-up) / <alpha-value>)',
          down: 'rgb(var(--market-down) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['Microsoft YaHei', 'PingFang SC', 'sans-serif'],
        body: ['Inter', 'Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
        data: ['Bahnschrift', 'DIN Alternate', 'IBM Plex Mono', 'monospace'],
      },
      boxShadow: {
        raised: '0 10px 30px rgb(15 23 42 / 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;
