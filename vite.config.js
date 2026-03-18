import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";

const commitHash = (() => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "unknown"; }
})();
const buildDate = new Date().toISOString().slice(0, 10);

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(`${buildDate} · ${commitHash}`),
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  build: {
    minify: "esbuild",
  },
  esbuild: {
    // Strip console.log and debugger in production; keep warn/error
    drop: mode === "production" ? ["debugger"] : [],
    pure: mode === "production" ? ["console.log"] : [],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.js"],
  },
}));
