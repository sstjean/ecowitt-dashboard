import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openWriteStore, type WriteStore } from "../src/store.ts";
import { ingestPayload } from "../src/ingest.ts";

export function validPayload(): unknown {
  return {
    common_list: [
      { id: "0x02", val: "72.4" },
      { id: "0x07", val: "64" },
      { id: "3", val: "70.9" },
      { id: "0x03", val: "55.5" },
      { id: "0x0B", val: "4.1" },
      { id: "0x0C", val: "9.2" },
      { id: "0x19", val: "18.4" },
      { id: "0x0A", val: "210" },
      { id: "0x15", val: "612" },
      { id: "0x17", val: "5" },
      { id: "0x6D", val: "205" },
    ],
    wh25: [{ intemp: "70.2", inhumi: "48", abs: "30.01", rel: "30.05" }],
    piezoRain: [
      { id: "srain_piezo", val: "0" },
      { id: "0x0D", val: "0" },
      { id: "0x0E", val: "0" },
      { id: "0x7C", val: "0" },
      { id: "0x10", val: "0" },
      { id: "0x11", val: "0" },
      { id: "0x12", val: "0" },
      { id: "0x13", val: "0" },
    ],
  };
}

let dir: string;
let dbPath: string;
let store: WriteStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ecowitt-ingest-"));
  dbPath = join(dir, "readings.db");
  store = openWriteStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("ingestPayload", () => {
  it("validates, maps, persists exactly one row, and returns the curated snapshot", () => {
    const now = new Date("2026-06-21T15:30:00Z");
    const reading = ingestPayload(validPayload(), { store, now: () => now });

    expect(reading.observedAt).toBe("2026-06-21T15:30:00.000Z");
    expect(reading.outdoorTempF).toBe(72.4);
    expect(reading.feelsLikeF).toBe(70.9);
    expect(reading.outdoorHumidityPct).toBe(64);
    expect(reading.isRaining).toBe(false);

    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare("SELECT observed_at, metrics_json FROM readings").all() as Array<{
      observed_at: string;
      metrics_json: string;
    }>;
    db.close();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.observed_at).toBe("2026-06-21T15:30:00.000Z");
    const metrics = JSON.parse(rows[0]!.metrics_json);
    expect(metrics.outdoorTempF).toBe(72.4);
    expect(metrics.pressureHpa).toBeCloseTo(1016.256, 2);
  });

  it("rejects a malformed payload and writes nothing", () => {
    const now = new Date("2026-06-21T15:30:00Z");
    expect(() => ingestPayload({ not: "a gateway payload" }, { store, now: () => now })).toThrow();

    const db = new Database(dbPath, { readonly: true });
    const count = db.prepare("SELECT COUNT(*) AS n FROM readings").get() as { n: number };
    db.close();
    expect(count.n).toBe(0);
  });
});
