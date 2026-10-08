import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The version shown at the bottom of the menu: package.json's version and the commit the build was made from.
const version = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version as string;
const build = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
})();

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version), __APP_BUILD__: JSON.stringify(build) },
  worker: {
    format: "es",
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      // Precache everything so the app works fully offline after the first load.
      workbox: {
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,wasm,svg,png,ico,woff2}"],
        // the viewport test page is its own little app, not part of this one
        navigateFallbackDenylist: [/^\/viewport-test/],
      },
      manifest: {
        name: "tunegod",
        short_name: "tunegod",
        description: "Tune a Koala project's pads to a key — on-device.",
        theme_color: "#222326",
        background_color: "#222326",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
