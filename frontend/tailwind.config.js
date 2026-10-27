/** @type {import('tailwindcss').Config} */
// Every colour is a CSS variable from src/index.css, so light/dark switch in one place.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: v('ground'),
        paper: v('paper'),
        surface: v('surface'),
        raised: v('raised'),
        active: v('active'),
        line: v('border'),
        rule: v('rule'),
        control: v('control'),
        ink: v('ink'),
        muted: v('muted'),
        primary: v('primary'),
        'on-primary': v('on-primary'),
        brass: v('brass'),
        'brass-ink': v('brass-ink'),
        data: v('data'),
        field: v('field'),
        'field-ink': v('field-ink'),
        positive: v('positive'),
        negative: v('negative'),
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'Impact', 'sans-serif'],
        serif: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '8px', control: '6px', chip: '4px' },
      // IBM Plex Sans for all text; Bebas Neue only for the wordmark and display headings.
      fontSize: { xs: ['13px', '18px'], sm: ['14px', '20px'], base: ['16px', '24px'], lg: ['18px', '28px'] },
    },
  },
  plugins: [],
};
