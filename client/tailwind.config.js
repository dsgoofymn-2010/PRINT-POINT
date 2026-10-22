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
        serif: ['"EB Garamond"', 'Georgia', 'serif'],
        sans: ['"EB Garamond"', 'Georgia', 'serif'],
      },
      borderRadius: { card: '8px', control: '6px', chip: '4px' },
      // EB Garamond sets small; the app scale sits one step above the grotesk defaults.
      fontSize: { xs: ['14px', '20px'], sm: ['15px', '22px'], base: ['17px', '26px'], lg: ['19px', '28px'] },
    },
  },
  plugins: [],
};
