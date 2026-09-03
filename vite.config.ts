import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/smart-flow/" : "/",
  server: {
    host: "::",
    port: 8123,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null, // we handle registration manually with a guard in main.tsx
      devOptions: { enabled: false },
      manifest: false,
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp}"],
        // og-image.png is only fetched by social scrapers from the live server,
        // never by the app — keep it out of the offline precache (it also
        // exceeds the 2 MiB precache limit and would fail the build).
        globIgnores: ["**/og-image.png"],
        // The schema designer (React Flow's dependencies + antd's full
        // component set + the new canvas code) pushed the main JS chunk
        // past workbox's 2 MiB default precache limit, 2026-09-03. Raised
        // to 3 MiB to unblock the build. The real fix is code-splitting
        // the bundle (react-flow is only used by 4 of 6 diagram types; the
        // schema canvas is a natural lazy-load boundary) — that's a
        // deliberate perf pass, not a same-session fix, so it's flagged
        // here rather than done as a side effect of raising this number.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
