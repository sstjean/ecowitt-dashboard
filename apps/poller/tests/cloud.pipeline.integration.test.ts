import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function metric(value: string): { value: string } {
  return { value };
}

/** A cloud `real_time` envelope with an overridable outdoor temperature. */
function cloudEnvelope(outdoorTempF: string): unknown {
  return {
    code: 0,
    msg: "success",
    time: "1750531200",
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

function stubFetch(body: unknown): typeof fetch {
  return (async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as typeof fetch;
}

let dir: string;
let dbPath: string;
let writeStore: WriteStore;
let readStore: ReadStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ecowitt-cloud-pipeline-"));
  dbPath = join(dir, "readings.db");
  writeStore = openWriteStore(dbPath);
  readStore = openReadStore(dbPath);
});

afterEach(() => {
  readStore.close();
  writeStore.close();
  rmSync(dir, { recursive: true, force: true });
});

const cloudCreds = {
  baseUrl: "https://api.ecowitt.net",
  appKey: "app-key",
  apiKey: "api-key",
  mac: "AA:BB:CC:DD:EE:FF",
  timeoutMs: 5000,
};

describe("cloud poll → adapter → store → API pipeline", () => {
  it("reflects stub cloud values through the API with no schema errors", async () => {
    const errors: string[] = [];
    const onError = (error: string) => errors.push(error);

    const reading = await runCloudPollCycle({
      ...cloudCreds,
      fetchImpl: stubFetch(cloudEnvelope("72.4")),
      store: writeStore,
      now: () => new Date("2026-06-21T15:30:00Z"),
      onError,
    });

    expect(errors).toEqual([]);
    expect(reading?.outdoorTempF).toBe(72.4);

    const snap = buildLatestSnapshot(readStore, config, new Date("2026-06-21T15:31:00Z"), {
      conditionIcon: null,
      conditionStale: true,
    });
    expect(snap.status).toBe("ok");
    expect(snap.reading?.outdoorTempF).toBe(72.4);
    expect(snap.reading?.maxDailyGustMph).toBe(9.2); // synthesized field present
    expect(snap.reading?.isRaining).toBe(false);
  });
});
