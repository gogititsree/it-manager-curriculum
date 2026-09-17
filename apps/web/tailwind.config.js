/**
 * Tokens only. Every colour is a CSS custom property defined in src/index.css so that light and
 * dark are one palette with two value sets, and nothing in a component hard-codes a hex.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        rule: 'var(--rule)',
        'rule-strong': 'var(--rule-strong)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        'accent-soft': 'var(--accent-soft)',
        focus: 'var(--focus)',
      },
      fontFamily: {
        read: 'var(--font-read)',
        ui: 'var(--font-ui)',
        mono: 'var(--font-mono)',
      },
      maxWidth: {
        read: '43rem', // ~688px of prose; the reading measure the whole app is built around
        app: '64rem',
      },
      letterSpacing: { label: '0.09em' },
      borderRadius: { xs: '2px' },
    },
  },
  plugins: [],
};
