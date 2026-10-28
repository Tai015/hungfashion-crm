/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#f97316',
          dark:    '#ea580c',
          light:   '#fb923c',
        },
        surface: {
          DEFAULT: 'rgba(255,255,255,0.055)',
          hover:   'rgba(255,255,255,0.09)',
          strong:  'rgba(255,255,255,0.12)',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      backdropBlur: {
        xs: '4px',
      },
      borderColor: {
        glass: 'rgba(255,255,255,0.1)',
      },
      keyframes: {
        spin: { to: { transform: 'rotate(360deg)' } },
        'fade-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'spin-slow': 'spin 0.8s linear infinite',
        'fade-in':   'fade-in 0.2s ease',
      },
    },
  },
  plugins: [],
};
