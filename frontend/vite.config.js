/**
 * Vite build and dev server settings for the NeuroGuide frontend.
 *
 * This file configures the Vite server to run the React app and uses a proxy to forward API requests to the backend,
 *  avoiding CORS restrictions.
 *
 * @file
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
