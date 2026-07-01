import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { SensorHealthEntry } from "@ecowitt/shared";
import { SENSOR_HEALTH_DEFAULTS } from "@ecowitt/shared";
import { openReadStore, type ReadStore } from "../src/store.ts";
import { buildSensorHealthEnvelope } from "../src/sensorHealth.ts";

const SENSOR_HEALTH_BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS sensor_health (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  captured_at TEXT NOT NULL,
  sensors_json TEXT NOT NULL
);`;

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
      lastSeenUtc: "2026-06-30T14:05:00Z",
    },
  ];
}

let dir: string;
let dbPath: string;
let store: ReadStore;

function seedHealth(capturedAt: string, sensors: SensorHealthEntry[]): void {
  const db = new Database(dbPath);
  db.exec(SENSOR_HEALTH_BOOTSTRAP);
  db.prepare(
    `INSERT INTO sensor_health (id, captured_at, sensors_json) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET captured_at = excluded.captured_at, sensors_json = excluded.sensors_json`,
  ).run(capturedAt, JSON.stringify(sensors));
  db.close();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ecowitt-api-health-"));
  dbPath = join(dir, "readings.db");
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("getSensorHealth (store reader)", () => {
  it("returns null when no snapshot row exists", () => {
    store = openReadStore(dbPath);
    expect(store.getSensorHealth()).toBeNull();
  });

  it("returns the parsed snapshot when a row exists", () => {
    seedHealth("2026-06-30T14:05:00Z", sampleSensors());
    store = openReadStore(dbPath);
    const health = store.getSensorHealth();
    expect(health?.capturedAt).toBe("2026-06-30T14:05:00Z");
    expect(health?.sensors).toHaveLength(1);
    expect(health?.sensors[0]!.id).toBe("12FAD");
    expect(health?.sensors[0]!.battery).toBe("OK");
  });

  it("bootstraps the sensor_health table idempotently (cold API start)", () => {
    store = openReadStore(dbPath);
    expect(() => store.getSensorHealth()).not.toThrow();
    const db = new Database(dbPath, { readonly: true });
    const cols = (db.pragma("table_info(sensor_health)") as Array<{ name: string }>).map(
      (c) => c.name,
    );
    db.close();
    expect(cols).toEqual(
      expect.arrayContaining(["id", "captured_at", "sensors_json"]),
    );
  });
});

describe("buildSensorHealthEnvelope (freshness decision)", () => {
  const STALE = SENSOR_HEALTH_DEFAULTS.SENSOR_HEALTH_STALE_SECONDS; // 300
  const now = new Date("2026-06-30T14:10:00Z");

  it("null row ⇒ available:false, stale:true, capturedAtUtc:null, sensors:[]", () => {
    expect(buildSensorHealthEnvelope(null, now, STALE)).toEqual({
      available: false,
      stale: true,
      capturedAtUtc: null,
      sensors: [],
    });
  });

  it("fresh row (≤ staleSeconds) ⇒ available:true, stale:false, passthrough", () => {
    const row = { capturedAt: "2026-06-30T14:08:00Z", sensors: sampleSensors() }; // 120s ago
    const env = buildSensorHealthEnvelope(row, now, STALE);
    expect(env.available).toBe(true);
    expect(env.stale).toBe(false);
    expect(env.capturedAtUtc).toBe("2026-06-30T14:08:00Z");
    expect(env.sensors).toEqual(sampleSensors());
  });

  it("aged row (> staleSeconds) ⇒ available:true, stale:true, last-known sensors", () => {
    const row = { capturedAt: "2026-06-30T14:00:00Z", sensors: sampleSensors() }; // 600s ago
    const env = buildSensorHealthEnvelope(row, now, STALE);
    expect(env.available).toBe(true);
    expect(env.stale).toBe(true);
    expect(env.capturedAtUtc).toBe("2026-06-30T14:00:00Z");
    expect(env.sensors).toEqual(sampleSensors());
  });

  it("boundary now − captured === staleSeconds ⇒ NOT stale (≤ is fresh)", () => {
    const row = { capturedAt: "2026-06-30T14:05:00Z", sensors: sampleSensors() }; // exactly 300s
    expect(buildSensorHealthEnvelope(row, now, STALE).stale).toBe(false);
  });
});
