import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { FullMetricMap } from "@ecowitt/shared";
import { openReadStore, type ReadStore } from "../src/store.ts";

let dir: string;
let dbPath: string;
let store: ReadStore;

function metrics(tempF: number): FullMetricMap {
  return { outdoorTempF: tempF, pressureHpa: 1013, common_0x99: "kept" };
}

function seed(observedAt: string, m: FullMetricMap): void {
  const db = new Database(dbPath);
  db.prepare(
    "INSERT INTO readings (observed_at, metrics_json) VALUES (?, ?)",
  ).run(observedAt, JSON.stringify(m));
  db.close();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ecowitt-api-store-"));
  dbPath = join(dir, "readings.db");
  store = openReadStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("openReadStore", () => {
  it("returns null latest for an empty store", () => {
    expect(store.getLatest()).toBeNull();
  });

  it("returns an empty window for an empty store", () => {
    expect(store.getWindow("2026-06-21T15:00:00Z")).toEqual([]);
  });

  it("returns the most recent reading as latest", () => {
    seed("2026-06-21T17:00:00Z", metrics(70));
    seed("2026-06-21T18:00:00Z", metrics(73));
    seed("2026-06-21T17:30:00Z", metrics(71));

    const latest = store.getLatest();
    expect(latest).not.toBeNull();
    expect(latest!.observedAt).toBe("2026-06-21T18:00:00Z");
    expect(latest!.metrics.outdoorTempF).toBe(73);
    expect(latest!.metrics.common_0x99).toBe("kept");
  });

  it("returns the 3-hour window ascending, excluding older rows", () => {
    seed("2026-06-21T14:30:00Z", metrics(60)); // outside window
    seed("2026-06-21T15:10:00Z", metrics(64));
    seed("2026-06-21T16:45:00Z", metrics(68));
    seed("2026-06-21T18:00:00Z", metrics(73));

    const window = store.getWindow("2026-06-21T15:00:00Z");
    expect(window.map((r) => r.observedAt)).toEqual([
      "2026-06-21T15:10:00Z",
      "2026-06-21T16:45:00Z",
      "2026-06-21T18:00:00Z",
    ]);
    expect(window[0]!.metrics.outdoorTempF).toBe(64);
  });
});
