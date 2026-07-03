import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works at any mount path (e.g. GitHub
  // Pages project sites served under /<repo>/).
  base: "./",
  build: {
    chunkSizeWarningLimit: 6000,
  },
});
