import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Windows 7 is the oldest supported target, and the last WebView2 runtime
  // released for it is 109 (see `minimumWebview2Version` in tauri.conf.json).
  // Pin the JS/CSS output to that floor rather than riding Vite's default
  // target, so a dependency shipping newer syntax fails the build here
  // instead of at runtime on a hospital's Windows 7 machine.
  build: {
    target: "chrome109",
    cssTarget: "chrome109",
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
