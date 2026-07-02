/**
 * Compile-time build id injected by the Vite build-id plugin via `define`.
 * Its value equals the `buildId` emitted into `dist/version.json` (single source),
 * so a freshly loaded build always finds baked id == served id (FR-004).
 */
declare const __BUILD_ID__: string;
