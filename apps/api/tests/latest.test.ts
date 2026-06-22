import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { FullMetricMap } from "@ecowitt/shared";
import { buildServer } from "../src/server.ts";
import { openReadStore, type ReadStore } from "../src/store.ts";
import { degToCardinal } from "../src/enrich.ts";
import type { ApiConfig } from "../src/config.ts";

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

const BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observed_at TEXT NOT NULL UNIQUE,
  metrics_json TEXT NOT NULL,
  pressure_hpa REAL GENERATED ALWAYS AS (json_extract(metrics_json, '$.pressureHpa')) STORED
);`;

function sampleMetrics(): FullMetricMap {
  return {
    outdoorTempF: 72.4,
    feelsLikeF: 70.9,
    dewpointF: 55.5,
    outdoorHumidityPct: 64,
    windMph: 4.1,
    windDirDeg: 210,
    gustMph: 9.2,
    windAvg10mDirDeg: 205,
    maxDailyGustMph: 18.4,
    solarWm2: 612,
    uvIndex: 5,
    indoorTempF: 70.2,
    indoorHumidityPct: 48,
    rainEventIn: 0,
    rainHourlyIn: 0,
    rainDailyIn: 0,
    rainWeeklyIn: 0,
    rainMonthlyIn: 0,
    rainYearlyIn: 0,
    rainRateInHr: 0,
    isRaining: 0,
    pressureHpa: 1016.2,
  };
}

let dir: string;
let dbPath: string;
let store: ReadStore;

function seed(observedAt: string, metrics: FullMetricMap): void {
  const db = new Database(dbPath);
  db.exec(BOOTSTRAP);
  db.prepare("INSERT INTO readings (observed_at, metrics_json) VALUES (?, ?)").run(
    observedAt,
    JSON.stringify(metrics),
  );
  db.close();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ecowitt-latest-"));
  dbPath = join(dir, "readings.db");
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/v1/latest", () => {
  it("returns status ok with the projected reading + derived aggregates + serverTime", async () => {
    seed("2026-06-21T15:30:00.000Z", sampleMetrics());
    store = openReadStore(dbPath);
    const app = buildServer({ store, config });
    const res = await app.inject({ method: "GET", url: "/api/v1/latest" });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      status: string;
      observedAt: string;
      reading: Record<string, unknown>;
      serverTime: string;
    };
    expect(body.status).toBe("ok");
    expect(body.observedAt).toBe("2026-06-21T15:30:00.000Z");
    expect(body.reading.outdoorTempF).toBe(72.4);
    expect(body.reading.feelsLikeF).toBe(70.9);
    expect(body.reading.outdoorHumidityPct).toBe(64);
    expect(body.reading.isRaining).toBe(false);
    // API-derived aggregates (single reading ⇒ high = low = current temp)
    expect(body.reading.dayHighF).toBe(72.4);
    expect(body.reading.dayLowF).toBe(72.4);
    expect(body.reading.maxDailyGustDir).toBe(degToCardinal(210));
    expect(typeof body.reading.windAvg10mMph).toBe("number");
    expect(Number.isNaN(Date.parse(body.serverTime))).toBe(false);
  });

  it("returns an explicit no-data envelope (never fabricated zeros) for an empty store", async () => {
    store = openReadStore(dbPath);
    const app = buildServer({ store, config });
    const res = await app.inject({ method: "GET", url: "/api/v1/latest" });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      status: string;
      observedAt: string | null;
      reading: unknown;
      astro: unknown;
      conditionIcon: unknown;
      conditionStale: boolean;
      serverTime: string;
    };
    expect(body.status).toBe("no-data");
    expect(body.observedAt).toBeNull();
    expect(body.reading).toBeNull();
    // Astro is still computed (offline) even with no readings.
    expect(body.astro).not.toBeNull();
    // The NWS icon is never fabricated from an empty store.
    expect(body.conditionIcon).toBeNull();
    expect(body.conditionStale).toBe(true);
    expect(Number.isNaN(Date.parse(body.serverTime))).toBe(false);
  });
});
