import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        typing: {
          '0%': { opacity: '0', transform: 'translateY(0)' },
          '50%': { opacity: '1', transform: 'translateY(-4px)' },
          '100%': { opacity: '0', transform: 'translateY(0)' }
        }
      },
      animation: {
        typing: 'typing 1.4s infinite ease-in-out',
      }
    },
  },
  plugins: [],
}

export default config;