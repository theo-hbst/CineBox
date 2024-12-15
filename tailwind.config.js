// filepath: /c:/Users/theoh/MovieShare/tailwind.config.js
const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  darkMode: 'class', // false, class, media
  content: ['./public/**/*.{html,js}'],
  theme: {
    screens: {
      xs: '350px',
      ...defaultTheme.screens,
    },
    extend: {
      colors: {},
      fontFamily: {
        montserrat: ['Montserrat', 'sans-serif'],
        poppins: ['Poppins', 'sans-serif'],
      },
      fontSize: {
        xxs: '.65rem',
      },
    },
  },
  plugins: [],
};