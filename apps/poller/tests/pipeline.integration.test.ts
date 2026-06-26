import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openWriteStore, type WriteStore } from "../src/store.ts";
import { runPollCycle } from "../src/poll.ts";
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

/** Gateway payload with an overridable outdoor temperature. */
function payload(outdoorTempF: string): unknown {
  return {
    common_list: [
      { id: "0x02", val: outdoorTempF },
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

/** A fetch stub that returns the given payload as a successful JSON response. */
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
  dir = mkdtempSync(join(tmpdir(), "ecowitt-pipeline-"));
  dbPath = join(dir, "readings.db");
  writeStore = openWriteStore(dbPath);
  readStore = openReadStore(dbPath);
});

afterEach(() => {
  readStore.close();
  writeStore.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("poll → store → API pipeline", () => {
  it("reflects stub gateway values through the API, and a changed payload updates the latest snapshot", async () => {
    const errors: string[] = [];
    const onError = (error: string) => errors.push(error);

    // Cycle 1: gateway reports 72.4°F.
    const first = await runPollCycle({
      baseUrl: "http://gw.local",
      timeoutMs: 5000,
      fetchImpl: stubFetch(payload("72.4")),
      store: writeStore,
      now: () => new Date("2026-06-21T15:30:00Z"),
      onError,
    });
    expect(first?.outdoorTempF).toBe(72.4);

    const snap1 = buildLatestSnapshot(readStore, config, new Date("2026-06-21T15:31:00Z"), {
      conditionIcon: null,
      conditionStale: true,
      conditionText: null,
    });
    expect(snap1.status).toBe("ok");
    expect(snap1.reading?.outdoorTempF).toBe(72.4);
    expect(snap1.reading?.dayHighF).toBe(72.4);

    // Cycle 2: gateway now reports 80.0°F at a later timestamp.
    const second = await runPollCycle({
      baseUrl: "http://gw.local",
      timeoutMs: 5000,
      fetchImpl: stubFetch(payload("80.0")),
      store: writeStore,
      now: () => new Date("2026-06-21T15:32:00Z"),
      onError,
    });
    expect(second?.outdoorTempF).toBe(80);

    const snap2 = buildLatestSnapshot(readStore, config, new Date("2026-06-21T15:33:00Z"), {
      conditionIcon: null,
      conditionStale: true,
      conditionText: null,
    });
    expect(snap2.reading?.outdoorTempF).toBe(80);
    expect(snap2.reading?.dayHighF).toBe(80);
    expect(snap2.reading?.dayLowF).toBe(72.4);

    expect(errors).toEqual([]);
  });
});
