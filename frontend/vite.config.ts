import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/** Host Vite when run via ``docker-compose.dev.yml``; local ``npm run dev`` stays 127.0.0.1. */
const apiProxy = process.env.VITE_API_PROXY || "http://127.0.0.1:8000";
const usePolling = process.env.CHOKIDAR_USEPOLLING === "true";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173,
    watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: apiProxy,
        changeOrigin: true,
      },
      "/media": {
        target: apiProxy,
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
