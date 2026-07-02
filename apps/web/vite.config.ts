import { defineConfig, type Plugin } from "vite";

/**
 * ONE build id per build, used from a single in-memory value in two places so the
 * running page's baked id always matches the served marker (FR-001/002/003/004):
 *  1. `define` bakes it into the bundle as the compile-time constant `__BUILD_ID__`.
 *  2. `buildIdPlugin` emits `dist/version.json` = `{ "buildId": <id> }` for the
 *     running page to poll (served statically by the existing nginx `location /`).
 * An identical rebuild of the same source yields a different timestamp id, which is
 * exactly what a redeploy needs to trigger the self-heal reload.
 */
const buildId = String(Date.now());

function buildIdPlugin(id: string): Plugin {
  return {
    name: "ecowitt-build-id",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ buildId: id })}\n`,
      });
    },
  };
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [buildIdPlugin(buildId)],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
