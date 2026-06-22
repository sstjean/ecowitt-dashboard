import Fastify, { type FastifyInstance } from "fastify";
import type { ReadStore } from "./store.ts";
import type { ApiConfig } from "./config.ts";
import { registerHealthRoute } from "./routes/v1/health.ts";
import { registerLatestRoute } from "./routes/v1/latest.ts";

export interface ApiDeps {
  store: ReadStore;
  config: ApiConfig;
}

/** Build the Fastify app with all `/api/v1` routes registered. */
export function buildServer(deps: ApiDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(
    async (v1) => {
      registerHealthRoute(v1, deps.store);
      registerLatestRoute(v1, deps.store, deps.config);
    },
    { prefix: "/api/v1" },
  );
  return app;
}
