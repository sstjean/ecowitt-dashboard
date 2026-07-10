import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { FullMetricMap } from "@ecowitt/shared";
import type { SensorHealthEntry } from "@ecowitt/shared";
import { buildServer } from "../src/server.ts";
import { openReadStore, type ReadStore } from "../src/store.ts";
import { degToCardinal } from "../src/enrich.ts";
import { buildLatestSnapshot } from "../src/routes/v1/latest.ts";
import type { ConditionState } from "../src/nws.ts";
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

function sampleSensors(): SensorHealthEntry[] {
  return [
    {
      id: "12FAD",
      img: "wh90",
      type: 48,
      name: "WS90",
      battery: "OK",
      batteryRaw: 5,
      signalBars: 4,
      rssiDbm: -74,
      registered: true,
      lastSeenUtc: "2026-06-21T15:30:00.000Z",
    },
  ];
}

function seedHealth(capturedAt: string, sensors: SensorHealthEntry[]): void {
  const db = new Database(dbPath);
  db.exec(
    `CREATE TABLE IF NOT EXISTS sensor_health (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       captured_at TEXT NOT NULL,
       sensors_json TEXT NOT NULL
     );`,
  );
  db.prepare(
    `INSERT INTO sensor_health (id, captured_at, sensors_json) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET captured_at = excluded.captured_at, sensors_json = excluded.sensors_json`,
  ).run(capturedAt, JSON.stringify(sensors));
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

  it("resolves the injected NWS condition at read time (not echoed) into the envelope", async () => {
    seed("2026-06-21T15:30:00.000Z", sampleMetrics());
    store = openReadStore(dbPath);
    // The new ConditionState carries text only; the route RESOLVES the icon.
    // "Mostly Cloudy" is day/night-independent, so the assertion is
    // deterministic against the route's real `now`.
    const nws = {
      refresh: async (): Promise<void> => {},
      current: (): ConditionState => ({
        conditionText: "Mostly Cloudy",
        conditionStale: false,
        hasObservation: true,
      }),
    };
    const app = buildServer({ store, config, nws });
    const res = await app.inject({ method: "GET", url: "/api/v1/latest" });
    await app.close();

    const body = res.json() as {
      conditionIcon: string;
      conditionStale: boolean;
      conditionText: string | null;
    };
    expect(body.conditionIcon).toBe("cloudy");
    expect(body.conditionStale).toBe(false);
    expect(body.conditionText).toBe("Mostly Cloudy");
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

// Day/night-dependent resolution is driven through buildLatestSnapshot directly
// so `now` is injectable (the route handler uses a non-injectable `new Date()`).
// config.householdLat/lon = 40,-75: 2026-06-21 sunrise ~09:25Z, sunset ~00:31Z(+1).
const DAY_NOW = new Date("2026-06-21T16:00:00.000Z"); // 12:00 EDT — daytime
const NIGHT_NOW = new Date("2026-06-21T07:00:00.000Z"); // 03:00 EDT — before sunrise

describe("buildLatestSnapshot condition resolution (read-time, astro-driven)", () => {
  it("passes cold-start through unchanged: no observation ⇒ null icon/text, stale", () => {
    store = openReadStore(dbPath); // empty store ⇒ no-data envelope
    const condition: ConditionState = {
      conditionText: null,
      conditionStale: true,
      hasObservation: false,
    };
    const snap = buildLatestSnapshot(store, config, DAY_NOW, condition);
    expect(snap.status).toBe("no-data");
    expect(snap.conditionIcon).toBeNull();
    expect(snap.conditionText).toBeNull();
    expect(snap.conditionStale).toBe(true);
  });

  it("forces the unavailable contract when no observation, even if the caller says not stale", () => {
    store = openReadStore(dbPath); // empty store ⇒ no-data envelope
    // Defensive: a no-observation state must always read stale (FR-005), so a
    // bogus { hasObservation: false, conditionStale: false } is overridden.
    const condition: ConditionState = {
      conditionText: null,
      conditionStale: false,
      hasObservation: false,
    };
    const snap = buildLatestSnapshot(store, config, DAY_NOW, condition);
    expect(snap.conditionIcon).toBeNull();
    expect(snap.conditionText).toBeNull();
    expect(snap.conditionStale).toBe(true);
  });

  it("omits the label for an empty-text fetch but still resolves the icon (not forced stale)", () => {
    seed("2026-06-21T15:30:00.000Z", sampleMetrics());
    store = openReadStore(dbPath);
    const condition: ConditionState = {
      conditionText: "",
      conditionStale: false,
      hasObservation: true,
    };
    const snap = buildLatestSnapshot(store, config, DAY_NOW, condition);
    expect(snap.conditionIcon).toBe("clear"); // daytime, never night
    expect(snap.conditionText).toBeNull(); // label omitted, not a blank string
    expect(snap.conditionStale).toBe(false); // empty text is not why it greys
  });

  it("resolves clear-day good text to clear and keeps the label", () => {
    seed("2026-06-21T15:30:00.000Z", sampleMetrics());
    store = openReadStore(dbPath);
    const condition: ConditionState = {
      conditionText: "Sunny",
      conditionStale: false,
      hasObservation: true,
    };
    const snap = buildLatestSnapshot(store, config, DAY_NOW, condition);
    expect(snap.conditionIcon).toBe("clear");
    expect(snap.conditionText).toBe("Sunny");
  });

  it("resolves the icon from astro even when an observation carries null text", () => {
    seed("2026-06-21T15:30:00.000Z", sampleMetrics());
    store = openReadStore(dbPath);
    // Defensive: hasObservation true with null text coerces to "" for resolution.
    const condition: ConditionState = {
      conditionText: null,
      conditionStale: false,
      hasObservation: true,
    };
    expect(buildLatestSnapshot(store, config, DAY_NOW, condition).conditionIcon).toBe("clear");
    expect(buildLatestSnapshot(store, config, NIGHT_NOW, condition).conditionIcon).toBe("night");
  });

  it("flips clear↔night across the astro boundary from ONE cached observation (no refetch)", () => {
    seed("2026-06-21T15:30:00.000Z", sampleMetrics());
    store = openReadStore(dbPath);
    const cached: ConditionState = {
      conditionText: "Clear",
      conditionStale: false,
      hasObservation: true,
    };
    // Same observation object, two different `now` values, no fetch in between.
    expect(buildLatestSnapshot(store, config, DAY_NOW, cached).conditionIcon).toBe("clear");
    expect(buildLatestSnapshot(store, config, NIGHT_NOW, cached).conditionIcon).toBe("night");
  });

  it("flows last-good staleness through to the envelope (greys by age, icon still resolved)", () => {
    seed("2026-06-21T15:30:00.000Z", sampleMetrics());
    store = openReadStore(dbPath);
    const condition: ConditionState = {
      conditionText: "Clear",
      conditionStale: true,
      hasObservation: true,
    };
    const snap = buildLatestSnapshot(store, config, DAY_NOW, condition);
    expect(snap.conditionIcon).toBe("clear");
    expect(snap.conditionStale).toBe(true);
  });

  it("preserves the external condition contract: ok envelope emits all three fields", () => {
    seed("2026-06-21T15:30:00.000Z", sampleMetrics());
    store = openReadStore(dbPath);
    const condition: ConditionState = {
      conditionText: "Mostly Cloudy",
      conditionStale: false,
      hasObservation: true,
    };
    const snap = buildLatestSnapshot(store, config, DAY_NOW, condition);
    expect(snap.status).toBe("ok");
    expect(Object.keys(snap)).toEqual(
      expect.arrayContaining(["conditionIcon", "conditionStale", "conditionText"]),
    );
    expect(snap.conditionIcon).toBe("cloudy");
    expect(typeof snap.conditionStale).toBe("boolean");
    expect(snap.conditionText).toBe("Mostly Cloudy");
  });
});

// A 90-min window ending at DAY_NOW (16:00Z = 12:00 EDT) holding a SUSTAINED
// storm signature — each proxy ramps continuously at its per-30-min rate so any
// 30-min rolling delta meets the threshold AND the signature is already
// established at now-45 (satisfying the 014 sustained-duration gate, not just a
// leading edge): temp crashes at 12°F/30min, humidity surges 18%pts/30min, gust
// 16, pressure dips 1.3 hPa/30min, solar collapses 75%/30min, piezo flat at 0.
function seedStormWindow(): void {
  const startMs = Date.parse("2026-06-21T14:30:00.000Z");
  for (let i = 0; i <= 18; i += 1) {
    const minutes = i * 5;
    const spans = minutes / 30; // number of 30-min trend spans elapsed
    seed(new Date(startMs + minutes * 60_000).toISOString(), {
      ...sampleMetrics(),
      outdoorTempF: 90 - 12 * spans,
      outdoorHumidityPct: 40 + 18 * spans,
      gustMph: 16,
      pressureHpa: 1015 - 1.3 * spans,
      solarWm2: Math.max(0, 900 * (1 - 0.75 * spans)),
      rainRateInHr: 0,
      rainEventIn: 0,
    });
  }
}

const READING_CONDITION: ConditionState = {
  conditionText: "Mostly Cloudy",
  conditionStale: false,
  hasObservation: true,
};

describe("buildLatestSnapshot rain-fault wiring (US1)", () => {
  it("carries a suspect verdict + reason from the 90-min storm window onto the ok envelope", () => {
    seedStormWindow();
    store = openReadStore(dbPath);
    const snap = buildLatestSnapshot(store, config, DAY_NOW, READING_CONDITION);
    expect(snap.status).toBe("ok");
    expect(snap.rainSensorSuspect).toBe(true);
    expect(snap.rainSensorReason).toEqual(expect.any(String));
    expect(snap.rainSensorReason).not.toBe("");
  });

  it("carries { false, null } on the ok envelope when the gauge is working (single calm reading)", () => {
    seed("2026-06-21T15:55:00.000Z", sampleMetrics());
    store = openReadStore(dbPath);
    const snap = buildLatestSnapshot(store, config, DAY_NOW, READING_CONDITION);
    expect(snap.status).toBe("ok");
    expect(snap.rainSensorSuspect).toBe(false);
    expect(snap.rainSensorReason).toBeNull();
  });

  it("carries { false, null } on the no-data envelope (always present, strictObject)", () => {
    store = openReadStore(dbPath); // empty
    const snap = buildLatestSnapshot(store, config, DAY_NOW, READING_CONDITION);
    expect(snap.status).toBe("no-data");
    expect(snap.rainSensorSuspect).toBe(false);
    expect(snap.rainSensorReason).toBeNull();
  });
});

describe("buildLatestSnapshot sensor-health wiring (US1)", () => {
  const NOW = new Date("2026-06-21T15:30:30.000Z");
  const CONDITION = {
    conditionText: null,
    conditionStale: true,
    hasObservation: false,
  };

  it("carries the fresh sensor-health snapshot on the ok branch", () => {
    seed("2026-06-21T15:30:00.000Z", sampleMetrics());
    seedHealth("2026-06-21T15:30:00.000Z", sampleSensors());
    store = openReadStore(dbPath);
    const snap = buildLatestSnapshot(store, config, NOW, CONDITION);
    expect(snap.status).toBe("ok");
    expect(snap.sensorHealth.available).toBe(true);
    expect(snap.sensorHealth.stale).toBe(false);
    expect(snap.sensorHealth.capturedAtUtc).toBe("2026-06-21T15:30:00.000Z");
    expect(snap.sensorHealth.sensors.map((s) => s.id)).toEqual(["12FAD"]);
  });

  it("carries an empty sensorHealth on the no-data branch when no snapshot exists", () => {
    store = openReadStore(dbPath); // no readings, no health
    const snap = buildLatestSnapshot(store, config, NOW, CONDITION);
    expect(snap.status).toBe("no-data");
    expect(snap.sensorHealth).toEqual({
      available: false,
      stale: true,
      capturedAtUtc: null,
      sensors: [],
    });
  });

  it("surfaces the health snapshot on the no-data branch too (readings/health independent)", () => {
    seedHealth("2026-06-21T15:30:00.000Z", sampleSensors());
    store = openReadStore(dbPath); // health present, no readings
    const snap = buildLatestSnapshot(store, config, NOW, CONDITION);
    expect(snap.status).toBe("no-data");
    expect(snap.sensorHealth.available).toBe(true);
    expect(snap.sensorHealth.sensors).toHaveLength(1);
  });
});
