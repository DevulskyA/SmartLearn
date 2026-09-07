import { defineConfig } from "vite";

// T21: "one origin" in dev too — a relative fetch('/v1/...') from the Vite
// dev server proxies straight to the real API server, so the browser never
// needs CORS in this mode. Override target via SMARTLEARN_API_PROXY_TARGET
// if the API server isn't on its default port.
const API_PROXY_TARGET = process.env.SMARTLEARN_API_PROXY_TARGET || "http://localhost:3000";

export default defineConfig({
  clearScreen: false,
  server: {
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/target/**"],
    },
    proxy: {
      "/v1": { target: API_PROXY_TARGET, changeOrigin: true },
      "/health": { target: API_PROXY_TARGET, changeOrigin: true },
    },
  },
});
