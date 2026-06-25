import { describe, it, expect } from "vitest";
import { createNwsClient, type ObservationFetcher } from "../src/nws.ts";

const BASE_OPTS = {
  userAgent: "test-agent",
  cacheTtlSeconds: 600,
  staleAfterSeconds: 3600,
  timeoutMs: 5000,
};

const at = (iso: string): Date => new Date(iso);

describe("createNwsClient", () => {
  it("reports null + stale before any fetch has ever succeeded", () => {
    const client = createNwsClient({
      ...BASE_OPTS,
      fetcher: async () => ({ textDescription: "Clear", isDaytime: true }),
    });
    expect(client.current(at("2026-06-21T12:00:00Z"))).toEqual({
      conditionIcon: null,
      conditionStale: true,
      conditionText: null,
    });
  });

  it("caches and maps a successful observation, reused within the TTL", async () => {
    let calls = 0;
    const fetcher: ObservationFetcher = async () => {
      calls += 1;
      return { textDescription: "Cloudy", isDaytime: true };
    };
    const client = createNwsClient({ ...BASE_OPTS, fetcher });

    const t0 = at("2026-06-21T12:00:00Z");
    await client.refresh(t0);
    expect(client.current(at("2026-06-21T12:00:01Z"))).toEqual({
      conditionIcon: "cloudy",
      conditionStale: false,
      conditionText: "Cloudy",
    });
    expect(calls).toBe(1);

    // Within the 600s TTL the fetcher is not called again.
    await client.refresh(at("2026-06-21T12:05:00Z"));
    expect(calls).toBe(1);

    // Past the TTL it refetches.
    await client.refresh(at("2026-06-21T12:10:01Z"));
    expect(calls).toBe(2);
  });

  it("keeps the last good icon on failure and greys it once it ages past the stale window", async () => {
    let mode: "ok" | "fail" = "ok";
    const fetcher: ObservationFetcher = async () => {
      if (mode === "fail") {
        throw new Error("timeout");
      }
      return { textDescription: "Clear", isDaytime: true };
    };
    const client = createNwsClient({ ...BASE_OPTS, fetcher });

    const t0 = at("2026-06-21T12:00:00Z");
    await client.refresh(t0);

    // A later refresh fails; the last good icon is retained.
    mode = "fail";
    await client.refresh(at("2026-06-21T12:10:01Z"));
    const soon = client.current(at("2026-06-21T12:10:02Z"));
    expect(soon.conditionIcon).toBe("clear");
    expect(soon.conditionStale).toBe(false); // still inside the 3600s window

    // Once the last good fetch ages past NWS_STALE_AFTER_SECONDS it greys out.
    const old = client.current(at("2026-06-21T13:00:01Z"));
    expect(old.conditionIcon).toBe("clear");
    expect(old.conditionStale).toBe(true);
  });

  it("never throws to the caller when the fetch fails outright", async () => {
    const fetcher: ObservationFetcher = async () => {
      throw new Error("network down");
    };
    const client = createNwsClient({ ...BASE_OPTS, fetcher });

    const t0 = at("2026-06-21T12:00:00Z");
    await expect(client.refresh(t0)).resolves.toBeUndefined();
    expect(client.current(t0)).toEqual({
      conditionIcon: null,
      conditionStale: true,
      conditionText: null,
    });
  });
});
