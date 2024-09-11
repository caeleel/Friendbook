/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.tsx",
    "../public/index.html",
  ],
  theme: {
    extend: {
      keyframes: {
        typing: {
          '0%': { opacity: 0, transform: 'translateY(0)' },
          '50%': { opacity: 1, transform: 'translateY(-4px)' },
          '100%': { opacity: 0, transform: 'translateY(0)' }
        }
      },
      animation: {
        typing: 'typing 1.4s infinite ease-in-out',
      }
    },
  },
  plugins: [],
}

