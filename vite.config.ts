import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  worker: {
    format: "es",
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      // essentia.js / rubberband WASM assets are large; precache them so the
      // app works fully offline after the first load (the whole point of an
      // iOS-installed, local-processing PWA).
      workbox: {
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,wasm,svg,png,ico}"],
      },
      manifest: {
        name: "KoalaTune",
        short_name: "KoalaTune",
        description: "Detect the key of a loop, tune a sample batch to match, and time-stretch loops — on-device.",
        theme_color: "#18131e",
        background_color: "#18131e",
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
