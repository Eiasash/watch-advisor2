import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Scoring engine — heavy pure logic with no UI deps
          if (
            id.includes("outfitEngine/outfitBuilder") ||
            id.includes("outfitEngine/scoringFactors") ||
            id.includes("outfitEngine/scoring.js") ||
            id.includes("outfitEngine/confidence") ||
            id.includes("outfitEngine/explain") ||
            id.includes("outfitEngine/watchStyles") ||
            id.includes("config/scoringWeights") ||
            id.includes("config/strapRules") ||
            id.includes("config/weatherRules")
          ) {
            return "engine";
          }
          // Domain layer — pure functions, separate from engine
          if (id.includes("/domain/")) {
            return "domain";
          }
        },
      },
    },
  },
  esbuild: {
    // Strip console.log and debugger in production; keep warn/error
    drop: mode === "production" ? ["debugger"] : [],
    pure: mode === "production" ? ["console.log"] : [],
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
}));
