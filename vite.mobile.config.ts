import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Standalone browser build used by the offline Android WebView shell.
 * This deliberately bypasses the server/RSC build because AppClient and its
 * data are fully client-side.
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist-android",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "mobile/index.html"),
    },
  },
});
