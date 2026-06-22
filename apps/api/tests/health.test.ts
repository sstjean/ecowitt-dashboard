import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.ts";
import type { ReadStore } from "../src/store.ts";

function fakeStore(overrides: Partial<ReadStore> = {}): ReadStore {
  return {
    getLatest: () => null,
    getWindow: () => [],
    close: () => {},
    ...overrides,
  };
}

describe("GET /api/v1/health", () => {
  it("reports ok and a reachable store", async () => {
    const app = buildServer({ store: fakeStore() });
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      status: string;
      storeReachable: boolean;
      serverTime: string;
    };
    expect(body.status).toBe("ok");
    expect(body.storeReachable).toBe(true);
    expect(Number.isNaN(Date.parse(body.serverTime))).toBe(false);
  });

  it("reports degraded when the store probe throws", async () => {
    const app = buildServer({
      store: fakeStore({
        getLatest: () => {
          throw new Error("db unavailable");
        },
      }),
    });
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; storeReachable: boolean };
    expect(body.status).toBe("degraded");
    expect(body.storeReachable).toBe(false);
  });
});
