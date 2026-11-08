/** @type {import('tailwindcss').Config} */
// Every visual token points at a CSS variable in src/index.css, so a redesign only edits that file.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        ink: 'var(--color-text)',
        muted: 'var(--color-muted)',
        line: 'var(--color-border)',
        primary: 'var(--color-primary)',
        'primary-ink': 'var(--color-primary-contrast)',
        accent: 'var(--color-accent)',
        danger: 'var(--color-danger)',
        'danger-soft': 'var(--color-danger-soft)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        pill: '999px',
      },
      spacing: {
        nav: 'var(--nav-height)',
        gutter: 'var(--space-gutter)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
}
