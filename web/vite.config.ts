import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Two pages: / (landing) and /app/ (dashboard). The build goes into ../public, which the Express server
// serves as plain files, and is committed. So the server (and Render) never needs anything in this folder.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // @brain is the bot's own odds maths, @hedge the hedge quote, @history the market's candles, @live Gemini's live feed and @crash the crash story's facts
  // (all dependency-free), so the page computes with the very same functions as the server and the tests.
  // @replay is the February replay itself (replay/results.json), built into the page so its first screen needs no request.
  resolve: { alias: { "@brain": resolve(here, "../src/brain.mjs"), "@hedge": resolve(here, "../src/hedge.mjs"), "@history": resolve(here, "../src/market-history.mjs"), "@live": resolve(here, "../src/gemini-live.mjs"), "@crash": resolve(here, "../src/crash-test.mjs"), "@replay": resolve(here, "../replay/results.json"), "@": resolve(here, "src") } },
  publicDir: false,
  build: {
    outDir: resolve(here, "../public"),
    emptyOutDir: false,          // ../public also holds classic/ (the old page); scripts/clean.mjs removes only our own output
    assetsDir: "assets",
    rollupOptions: { input: { index: resolve(here, "index.html"), app: resolve(here, "app/index.html") } },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [resolve(here, "..")] },
    proxy: { "/api": "http://localhost:3000", "/healthz": "http://localhost:3000", "/classic": "http://localhost:3000" },
  },
});
