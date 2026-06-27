import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function gitValue(args, fallback) {
  try {
    return execFileSync("git", args, {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

export default defineConfig(({ mode }) => {
  const branch = process.env.MOON_BUILD_BRANCH || gitValue(["branch", "--show-current"], "unknown");
  const commit = process.env.MOON_BUILD_COMMIT || gitValue(["rev-parse", "HEAD"], "unknown");
  const buildTime = process.env.MOON_BUILD_TIME || new Date().toISOString();
  const version = { app: "MoonTv", branch, commit, buildTime };
  return {
  plugins: [
    react(),
    {
      name: "moon-build-version",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: `${JSON.stringify(version, null, 2)}\n`
        });
      }
    }
  ],
  define: {
    __MOON_BUILD_BRANCH__: JSON.stringify(branch),
    __MOON_BUILD_COMMIT__: JSON.stringify(commit),
    __MOON_BUILD_TIME__: JSON.stringify(buildTime)
  },
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
    host: "0.0.0.0",
    proxy: {
      "/photos": {
        target: "http://127.0.0.1:3000",
        changeOrigin: false
      },
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true
      },
      "/uploads": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true
      }
    }
  }
  };
});
