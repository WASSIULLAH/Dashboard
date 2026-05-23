/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6', // Professional blue
        secondary: '#64748b',
        background: '#f8fafc',
        border: '#e2e8f0',
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
