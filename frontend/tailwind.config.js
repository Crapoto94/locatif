/** Jetons de la maquette Stitch « Sobriété Institutionnelle Territoriale ». */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'inverse-surface': '#213145', 'on-tertiary-fixed': '#0d1c2e', 'tertiary-fixed': '#d5e3fc', 'on-primary-fixed': '#00184a',
        'on-tertiary-fixed-variant': '#3a485b', tertiary: '#0b1a2c', 'surface-container': '#e5eeff', 'on-surface-variant': '#444650',
        'surface-dim': '#cbdbf5', 'inverse-primary': '#b3c5ff', 'secondary-container': '#316bf3', 'surface-bright': '#f8f9ff',
        'outline-variant': '#c5c6d1', 'on-primary-container': '#7e93d5', 'on-primary': '#ffffff', 'tertiary-container': '#212f41',
        surface: '#f8f9ff', 'on-secondary-fixed-variant': '#003ea8', 'on-error-container': '#93000a', secondary: '#0051d5',
        'surface-container-highest': '#d3e4fe', 'on-secondary-container': '#fefcff', 'surface-container-high': '#dce9ff',
        'surface-container-low': '#eff4ff', 'surface-tint': '#465c9a', 'surface-variant': '#d3e4fe', 'secondary-fixed-dim': '#b4c5ff',
        outline: '#757681', 'error-container': '#ffdad6', 'tertiary-fixed-dim': '#b9c7df', 'on-tertiary-container': '#8897ad',
        'on-secondary-fixed': '#00174b', primary: '#001645', 'on-error': '#ffffff', 'on-background': '#0b1c30', 'primary-container': '#0f2a66',
        'surface-container-lowest': '#ffffff', 'primary-fixed-dim': '#b3c5ff', background: '#f8f9ff', 'on-tertiary': '#ffffff',
        'secondary-fixed': '#dbe1ff', 'on-secondary': '#ffffff', 'inverse-on-surface': '#eaf1ff', 'primary-fixed': '#dbe1ff', error: '#ba1a1a',
        'on-primary-fixed-variant': '#2d4480', 'on-surface': '#0b1c30',
      },
      borderRadius: { DEFAULT: '0.125rem', lg: '0.25rem', xl: '0.5rem', full: '0.75rem' },
      spacing: { 'gutter-desktop': '1.5rem', 'space-lg': '1.25rem', gutter: '1rem', 'space-xs': '0.25rem', 'space-sm': '0.5rem', 'space-md': '0.75rem', 'margin-desktop': '2rem', margin: '1rem', 'space-xl': '2rem' },
      fontFamily: { sans: ['Inter', '"Segoe UI"', 'system-ui', 'sans-serif'] },
      fontSize: {
        'body-lg': ['15px', { lineHeight: '22px', fontWeight: '400' }],
        display: ['30px', { lineHeight: '38px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.01em', fontWeight: '500' }],
        'headline-md': ['18px', { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-sm': ['15px', { lineHeight: '20px', fontWeight: '600' }],
        'body-md': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'numeric-tabular': ['13px', { lineHeight: '18px', fontWeight: '500' }],
        'body-sm': ['12px', { lineHeight: '16px', fontWeight: '400' }],
        'headline-lg': ['24px', { lineHeight: '32px', letterSpacing: '-0.015em', fontWeight: '600' }],
        'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.03em', fontWeight: '600' }],
      },
    },
  },
  plugins: [],
};
