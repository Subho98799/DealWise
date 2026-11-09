/** @type {import('tailwindcss').Config} */
// Every visual token points at a CSS variable in src/styles/tokens.css.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        line: 'var(--color-border)',
        primary: 'var(--color-brand)',
        'primary-ink': 'var(--color-brand-ink)',
        'brand-soft': 'var(--color-brand-soft)',
        accent: 'var(--color-warning)',
        success: 'var(--color-success)',
        'success-soft': 'var(--color-success-soft)',
        warning: 'var(--color-warning)',
        'warning-soft': 'var(--color-warning-soft)',
        danger: 'var(--color-danger)',
        'danger-soft': 'var(--color-danger-soft)',
        overlay: 'var(--color-overlay)',
        'avatar-a': 'var(--color-avatar-a)',
        'avatar-b': 'var(--color-avatar-b)',
        'avatar-c': 'var(--color-avatar-c)',
        'avatar-d': 'var(--color-avatar-d)',
        'avatar-e': 'var(--color-avatar-e)',
      },
      borderRadius: {
        sm: 'var(--radius-control)',
        md: 'var(--radius-card)',
        lg: 'var(--radius-card)',
        pill: 'var(--radius-chip)',
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
      },
      spacing: {
        nav: 'var(--nav-height)',
        gutter: 'var(--space-gutter)',
      },
      fontFamily: {
        sans: ['var(--font-ui)'],
        display: ['var(--font-display)'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
}
