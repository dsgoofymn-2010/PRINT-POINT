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
        magenta: v('magenta'),
        'on-magenta': v('on-magenta'),
        cyan: v('cyan'),
        'cyan-ink': v('cyan-ink'),
        yellow: v('yellow'),
        'on-yellow': v('on-yellow'),
        data: v('data'),
        positive: v('positive'),
        negative: v('negative'),
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        // Archivo was drawn for print and screen; it stays sturdy at small sizes on cheap phone screens.
        sans: ['Archivo', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '8px', control: '6px', chip: '4px' },
      fontSize: { xs: ['13px', '18px'], sm: ['14px', '21px'], base: ['16px', '25px'], lg: ['18px', '27px'] },
    },
  },
  plugins: [],
};
