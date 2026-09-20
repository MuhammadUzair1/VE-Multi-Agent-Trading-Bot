import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        base: {
          bg: '#0d1117',
          panel: '#131722',
          border: '#232734',
        },
        accent: {
          yellow: '#ecad0a',
          blue: '#209dd7',
          purple: '#753991',
        },
        up: '#26a65b',
        down: '#e5484d',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        'flash-up': {
          '0%': { backgroundColor: 'rgba(38, 166, 91, 0.45)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'flash-down': {
          '0%': { backgroundColor: 'rgba(229, 72, 77, 0.45)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      animation: {
        'flash-up': 'flash-up 550ms ease-out',
        'flash-down': 'flash-down 550ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
