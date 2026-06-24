import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveFreshness } from "@ecowitt/shared";
import { openWriteStore, type WriteStore } from "../src/store.ts";
import { runCloudPollCycle } from "../src/poll.ts";
import { openReadStore, type ReadStore } from "../../api/src/store.ts";
import { buildLatestSnapshot } from "../../api/src/routes/v1/latest.ts";
import type { ApiConfig } from "../../api/src/config.ts";

const config: ApiConfig = {
  sqlitePath: ":memory:",
  householdLat: 40,
  householdLon: -75,
  nwsUserAgent: "test",
  baroTrendWindowHours: 3,
  baroSteadyEpsilonHpa: 0.3,
  rainFullScaleIn: 4,
  nwsCacheTtlSeconds: 600,
  nwsStaleAfterSeconds: 3600,
  nwsTimeoutMs: 5000,
};

const CADENCE_SECONDS = 30;

function metric(value: string): { value: string } {
  return { value };
}

function cloudEnvelope(outdoorTempF: string): unknown {
  return {
    code: 0,
    msg: "success",
    data: {
      outdoor: {
        temperature: metric(outdoorTempF),
        feels_like: metric("70.9"),
        dew_point: metric("55.5"),
        humidity: metric("58"),
      },
      indoor: { temperature: metric("70.1"), humidity: metric("47") },
      solar_and_uvi: { solar: metric("612.0"), uvi: metric("5") },
      wind: {
        wind_speed: metric("4.1"),
        wind_gust: metric("9.2"),
        wind_direction: metric("212"),
      },
      pressure: { relative: metric("30.01"), absolute: metric("29.74") },
      rainfall_piezo: {
        rain_rate: metric("0.00"),
        event: metric("0.10"),
        hourly: metric("0.20"),
        daily: metric("0.30"),
        weekly: metric("0.40"),
        monthly: metric("1.50"),
        yearly: metric("12.34"),
      },
    },
  };
}

function stubOk(body: unknown): typeof fetch {
  return (async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;
}

function stubTimeout(): typeof fetch {
  return (async () => {
    throw new Error("network timeout");
  }) as unknown as typeof fetch;
}

let dir: string;
let dbPath: string;
let writeStore: WriteStore;
let readStore: ReadStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ecowitt-cloud-resilience-"));
  dbPath = join(dir, "readings.db");
  writeStore = openWriteStore(dbPath);
  readStore = openReadStore(dbPath);
});

afterEach(() => {
  readStore.close();
  writeStore.close();
  rmSync(dir, { recursive: true, force: true });
});

const creds = {
  baseUrl: "https://api.ecowitt.net",
  appKey: "app-key",
  apiKey: "api-key",
  mac: "AA:BB:CC:DD:EE:FF",
  timeoutMs: 5000,
};

async function cycle(fetchImpl: typeof fetch, at: string, onError: (e: string) => void) {
  return runCloudPollCycle({
    ...creds,
    fetchImpl,
    store: writeStore,
    now: () => new Date(at),
    onError,
  });
}

describe("cloud poller resilience through failures", () => {
  it("holds the last good reading through a non-zero code, a timeout, and an invalid-data payload, then recovers to Fresh", async () => {
    const errors: string[] = [];
    const onError = (e: string) => errors.push(e);

    // Cycle 1: a good reading lands.
    const first = await cycle(stubOk(cloudEnvelope("72.4")), "2026-06-21T15:30:00Z", onError);
    expect(first?.outdoorTempF).toBe(72.4);

    // Cycle 2: non-zero code (bad key) — reported, nothing persisted.
    const badKey = await cycle(
      stubOk({ code: 40010, msg: "Invalid application Key", data: [] }),
      "2026-06-21T15:30:30Z",
      onError,
    );
    expect(badKey).toBeNull();

    // Cycle 3: timeout — reported, nothing persisted.
    const timedOut = await cycle(stubTimeout(), "2026-06-21T15:31:00Z", onError);
    expect(timedOut).toBeNull();

    // Cycle 4: code:0 but the `data` fails the cloud schema (missing wind group).
    // The adapter validation throw MUST be caught at the wiring (FR-022) — the
    // poller does not crash and the store is left untouched.
    const invalid = await cycle(
      stubOk({ code: 0, msg: "success", data: { outdoor: {} } }),
      "2026-06-21T15:31:30Z",
      onError,
    );
    expect(invalid).toBeNull();

    // Through all three failures the last good reading is still served.
    const held = buildLatestSnapshot(readStore, config, new Date("2026-06-21T15:31:35Z"), {
      conditionIcon: null,
      conditionStale: true,
    });
    expect(held.status).toBe("ok");
    expect(held.reading?.outdoorTempF).toBe(72.4);
    expect(held.observedAt).toBe("2026-06-21T15:30:00.000Z");
    expect(errors).toHaveLength(3);

    // Aged past 3× cadence, that held reading reads Stale (degrades to em-dashes).
    expect(
      deriveFreshness(held.observedAt, Date.parse("2026-06-21T15:32:00Z"), CADENCE_SECONDS),
    ).toBe("stale");

    // Cycle 5: a valid poll restores a current reading → Fresh again.
    const recovered = await cycle(stubOk(cloudEnvelope("80.0")), "2026-06-21T15:31:45Z", onError);
    expect(recovered?.outdoorTempF).toBe(80);

    const back = buildLatestSnapshot(readStore, config, new Date("2026-06-21T15:31:50Z"), {
      conditionIcon: null,
      conditionStale: true,
    });
    expect(back.reading?.outdoorTempF).toBe(80);
    expect(
      deriveFreshness(back.observedAt, Date.parse("2026-06-21T15:31:50Z"), CADENCE_SECONDS),
    ).toBe("fresh");
    expect(errors).toHaveLength(3);
  });
});
