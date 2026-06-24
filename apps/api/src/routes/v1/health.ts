import type { FastifyInstance } from "fastify";
import { healthSchema, type Health } from "@ecowitt/shared";
import type { ReadStore } from "../../store.ts";

/**
 * GET /health — liveness/readiness probe. Reports `degraded` and
 * `storeReachable: false` if the store cannot be queried.
 */
export function registerHealthRoute(app: FastifyInstance, store: ReadStore): void {
  app.get("/health", async (): Promise<Health> => {
    let storeReachable = true;
    try {
      store.getLatest();
    } catch {
      storeReachable = false;
    }
    return healthSchema.parse({
      status: storeReachable ? "ok" : "degraded",
      storeReachable,
      serverTime: new Date().toISOString(),
    });
  });
}
