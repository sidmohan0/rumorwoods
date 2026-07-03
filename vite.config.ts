import { defineConfig } from "vite";
import { execSync } from "node:child_process";

function commitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash()),
  },
  // Relative base so the build works at any mount path (e.g. GitHub
  // Pages project sites served under /<repo>/).
  base: "./",
  build: {
    chunkSizeWarningLimit: 6000,
  },
});
