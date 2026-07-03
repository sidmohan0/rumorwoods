/// <reference types="vite/client" />

/** Short git commit hash, injected at build time (vite.config.ts). */
declare const __COMMIT_HASH__: string;

/** Deployment variant ("v1" root, "v2" subpath, or "dev"), injected at build time. */
declare const __VARIANT__: string;
