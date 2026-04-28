/**
 * Vite build and dev server settings for the NeuroGuide frontend.
 *
 * This file configures the Vite server to run the React app and uses a proxy to forward API requests to the backend,
 *  avoiding CORS restrictions.
 *
 * @file
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

export default defineConfig(({ mode }) => {
  const fromRepoRoot = loadEnv(mode, repoRoot, "VITE_");
  const fromFrontend = loadEnv(mode, __dirname, "VITE_");
  const sitePassword = fromFrontend.VITE_SITE_PASSWORD ?? fromRepoRoot.VITE_SITE_PASSWORD ?? "";

  return {
    base: "/iteration_1/",
    plugins: [react()],
    publicDir: "../data",
    define: {
      "import.meta.env.VITE_SITE_PASSWORD": JSON.stringify(sitePassword),
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
  };
});
