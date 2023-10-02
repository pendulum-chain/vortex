import { colors } from './src/constants/colors';

// eslint-disable-next-line no-undef
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    'node_modules/daisyui/dist/**/*.js',
    'node_modules/react-daisyui/dist/**/*.js',
  ],
  // eslint-disable-next-line no-undef
  plugins: [require('daisyui')],
  themes: ['pendulum', 'amplitude'],
  theme: {
    extend: {
      colors,
      screens: {
        xs: '480px',
      },
    },
  },
  daisyui: {
    themes: [
      // The colors defined for the following themes have to match the ones defined in the color configuration
      // here: https://daisyui.com/docs/colors
      // Undefined colors will be chosen by daisyUI automatically.
      {
        pendulum: {
          primary: '#907EA0',
          'primary-content': '#fff',
          secondary: '#F4F5F6',
          'secondary-content': '#58667E',
          accent: '#1DE7DF',
          neutral: '#EFF2F5',
          'base-100': '#F5F9FA',
          'base-200': '#fff',
          'base-300': '#eff2f5',
          'base-content': '#58667E',
          '--rounded-btn': '9px',
          '--btn-text-case': 'none',
        },
        amplitude: {
          primary: '#4EE59A',
          'primary-content': '#fff',
          secondary: '#404040',
          'secondary-content': '#aaa',
          accent: '#00F197',
          'accent-content': '#fff',
          neutral: '#191D24',
          'neutral-focus': '#111318',
          'neutral-content': '#A6ADBB',
          'base-100': '#202020',
          'base-200': '#1c1c1c',
          'base-300': '#2c2c2c',
          'base-content': '#fff',
          '--rounded-btn': '9px',
          '--btn-text-case': 'none',
        },
      },
    ],
  },
};
