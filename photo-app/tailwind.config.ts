import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#171717",
        paper: "#f7f5f0",
        line: "#ded9ce",
        accent: "#2563eb",
      },
      boxShadow: {
        soft: "0 18px 50px rgba(23, 23, 23, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
