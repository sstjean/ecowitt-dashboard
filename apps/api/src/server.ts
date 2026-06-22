import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { openReadStore, type ReadStore } from "./store.ts";
import { loadApiConfig, type ApiConfig } from "./config.ts";
import {
  createNwsClient,
  createHttpObservationFetcher,
  type NwsClient,
} from "./nws.ts";
import { registerHealthRoute } from "./routes/v1/health.ts";
import { registerLatestRoute } from "./routes/v1/latest.ts";

export interface ApiDeps {
  store: ReadStore;
  config: ApiConfig;
  nws?: NwsClient;
}

/** Build the Fastify app with all `/api/v1` routes registered. */
export function buildServer(deps: ApiDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(
    async (v1) => {
      registerHealthRoute(v1, deps.store);
      registerLatestRoute(v1, deps.store, deps.config, deps.nws);
    },
    { prefix: "/api/v1" },
  );
  return app;
}

/** Wire config, store, and the live NWS client, then listen. */
async function main(): Promise<void> {
  const config = loadApiConfig(process.env);
  const store = openReadStore(config.sqlitePath);
  const nws = createNwsClient({
    fetcher: createHttpObservationFetcher(
      config.householdLat,
      config.householdLon,
      fetch,
    ),
    userAgent: config.nwsUserAgent,
    cacheTtlSeconds: config.nwsCacheTtlSeconds,
    staleAfterSeconds: config.nwsStaleAfterSeconds,
    timeoutMs: config.nwsTimeoutMs,
  });
  const app = buildServer({ store, config, nws });

  const port = Number(process.env.PORT ?? "8080");
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });

  const shutdown = (): void => {
    void app.close().then(() => {
      store.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Only run the server when executed directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
