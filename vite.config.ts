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
      // Precache everything so the app works fully offline after the first load.
      workbox: {
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,wasm,svg,png,ico}"],
      },
      manifest: {
        name: "KoalaTune",
        short_name: "KoalaTune",
        description: "Tune a Koala project's pads to a key — on-device.",
        theme_color: "#bcb5a1",
        background_color: "#bcb5a1",
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
