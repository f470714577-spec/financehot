import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#1E5AFA',
        },
        market: {
          up: '#E33E3E',
          down: '#1FA36B',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
