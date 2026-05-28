import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: "#080b13",
          panel: "#111827",
          card: "#161b26",
          line: "#263247",
          accent: "#6d7cff",
          cyan: "#35d0ff"
        }
      }
    }
  },
  plugins: []
} satisfies Config;
