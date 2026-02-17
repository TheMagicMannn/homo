/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        heading: ['Azeret Mono', 'monospace'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Chivo Mono', 'monospace'],
      },
      colors: {
        background: '#050505',
        surface: '#0A0A0A',
        overlay: '#111111',
        primary: '#00FF94',
        secondary: '#00FFFF',
        accent: '#FF00FF',
        destructive: '#FF0055',
        muted: '#262626',
        'muted-fg': '#737373',
        border: '#333333',
      },
    },
  },
  plugins: [],
};
