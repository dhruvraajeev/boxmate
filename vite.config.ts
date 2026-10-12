import { defineConfig } from "vite";

// The web app is built into dist/web, which the Node server serves.
// One port for both the page and the WebSocket keeps the Codespaces link shareable.
export default defineConfig({
  root: "web",
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
});
