import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  esbuild: {
    legalComments: "none",
    drop: mode === "production" ? ["console", "debugger"] : []
  },
  build: {
    sourcemap: false,
    minify: "esbuild",
    cssMinify: true,
    assetsDir: "assets",
    rollupOptions: {
      output: {
        compact: true,
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash][extname]"
      }
    }
  },
  server: {
    port: 3001,
    host: "0.0.0.0"
  }
}));
