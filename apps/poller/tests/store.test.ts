import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { FullMetricMap } from "@ecowitt/shared";
import { openWriteStore, type WriteStore } from "../src/store.ts";

let dir: string;
let dbPath: string;
let store: WriteStore;

function sampleMap(pressureHpa = 1013.2): FullMetricMap {
  return {
    outdoorTempF: 72,
    outdoorHumidityPct: 48,
    pressureHpa,
    common_0x99: "extra-preserved",
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ecowitt-poller-store-"));
  dbPath = join(dir, "readings.db");
  store = openWriteStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("openWriteStore", () => {
  it("bootstraps the readings table with the expected columns", () => {
    const db = new Database(dbPath, { readonly: true });
    // table_xinfo (not table_info) so the STORED generated column is listed too.
    const cols = (db.pragma("table_xinfo(readings)") as Array<{ name: string }>).map(
      (c) => c.name,
    );
    db.close();
    expect(cols).toEqual(
      expect.arrayContaining(["id", "observed_at", "metrics_json", "pressure_hpa"]),
    );
  });

  it("creates the observed_at index", () => {
    const db = new Database(dbPath, { readonly: true });
    const names = (db.pragma("index_list(readings)") as Array<{ name: string }>).map(
      (i) => i.name,
    );
    db.close();
    expect(names).toContain("idx_readings_observed_at");
  });

  it("enables WAL journaling", () => {
    const db = new Database(dbPath, { readonly: true });
    const mode = (db.pragma("journal_mode", { simple: true }) as string).toLowerCase();
    db.close();
    expect(mode).toBe("wal");
  });

  it("inserts a validated reading and projects pressure_hpa via the generated column", () => {
    store.insertReading("2026-06-21T18:05:00Z", sampleMap(1011.5));

    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare(
        "SELECT observed_at, metrics_json, pressure_hpa FROM readings WHERE observed_at = ?",
      )
      .get("2026-06-21T18:05:00Z") as {
      observed_at: string;
      metrics_json: string;
      pressure_hpa: number;
    };
    db.close();

    expect(row.observed_at).toBe("2026-06-21T18:05:00Z");
    expect(row.pressure_hpa).toBeCloseTo(1011.5, 3);
    const stored = JSON.parse(row.metrics_json) as FullMetricMap;
    expect(stored.common_0x99).toBe("extra-preserved");
  });

  it("rejects a duplicate observed_at", () => {
    store.insertReading("2026-06-21T18:05:00Z", sampleMap());
    expect(() =>
      store.insertReading("2026-06-21T18:05:00Z", sampleMap()),
    ).toThrow();
  });

  it("rejects an invalid metric map", () => {
    expect(() =>
      store.insertReading("2026-06-21T18:10:00Z", {
        nested: { bad: 1 },
      } as unknown as FullMetricMap),
    ).toThrow();
  });
});
