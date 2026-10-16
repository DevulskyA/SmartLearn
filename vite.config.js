import { defineConfig } from "vite";
import { readBuildIdentity } from "./scripts/build-identity.mjs";

// T21: "one origin" in dev too — a relative fetch('/v1/...') from the Vite
// dev server proxies straight to the real API server, so the browser never
// needs CORS in this mode. Override target via SMARTLEARN_API_PROXY_TARGET
// if the API server isn't on its default port.
const API_PROXY_TARGET = process.env.SMARTLEARN_API_PROXY_TARGET || "http://localhost:3000";

export default defineConfig(({ command }) => {
  // Embedded at build time: the app shows exactly the build it was made from (see src/build-identity-ui.js).
  const identity = readBuildIdentity({ command });
  return {
  clearScreen: false,
  define: { __APP_IDENTITY__: JSON.stringify(identity) },
  plugins: [{
    name: "smartlearn-build-info",
    generateBundle() { this.emitFile({ type: "asset", fileName: "build-info.json", source: JSON.stringify({ ...identity, builtAt: new Date().toISOString() }) }); },
  }],
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
  };
});
