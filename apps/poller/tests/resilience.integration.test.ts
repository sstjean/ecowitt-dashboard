import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveFreshness } from "@ecowitt/shared";
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

const CADENCE_SECONDS = 30;

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

/** A fetch stub returning the given payload as a successful JSON response. */
function stubOk(body: unknown): typeof fetch {
  return (async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;
}

/** A fetch stub that rejects, simulating a timeout / unreachable gateway. */
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
  dir = mkdtempSync(join(tmpdir(), "ecowitt-resilience-"));
  dbPath = join(dir, "readings.db");
  writeStore = openWriteStore(dbPath);
  readStore = openReadStore(dbPath);
});

afterEach(() => {
  readStore.close();
  writeStore.close();
  rmSync(dir, { recursive: true, force: true });
});

async function cycle(fetchImpl: typeof fetch, at: string, onError: (e: string) => void) {
  return runPollCycle({
    baseUrl: "http://gw.local",
    timeoutMs: 5000,
    fetchImpl,
    store: writeStore,
    now: () => new Date(at),
    onError,
  });
}

describe("poller resilience through gateway hiccups", () => {
  it("keeps the last good reading through timeouts and malformed payloads, then recovers to Fresh", async () => {
    const errors: string[] = [];
    const onError = (e: string) => errors.push(e);

    // Cycle 1: a good reading lands.
    const first = await cycle(stubOk(payload("72.4")), "2026-06-21T15:30:00Z", onError);
    expect(first?.outdoorTempF).toBe(72.4);

    // Cycle 2: timeout — reported, nothing persisted.
    const timedOut = await cycle(stubTimeout(), "2026-06-21T15:30:30Z", onError);
    expect(timedOut).toBeNull();

    // Cycle 3: malformed payload — reported, nothing persisted.
    const malformed = await cycle(stubOk({ garbage: true }), "2026-06-21T15:31:00Z", onError);
    expect(malformed).toBeNull();

    // Through both failures the last good reading is still served.
    const held = buildLatestSnapshot(readStore, config, new Date("2026-06-21T15:31:05Z"), {
      conditionIcon: null,
      conditionStale: true,
    });
    expect(held.status).toBe("ok");
    expect(held.reading?.outdoorTempF).toBe(72.4);
    expect(held.observedAt).toBe("2026-06-21T15:30:00.000Z");

    // Two distinct failures were surfaced; nothing was silently swallowed.
    expect(errors).toHaveLength(2);

    // Left to age past 3× cadence, that held reading reads Stale (not Fresh).
    const ageMs = Date.parse("2026-06-21T15:32:00Z");
    expect(deriveFreshness(held.observedAt, ageMs, CADENCE_SECONDS)).toBe("stale");

    // Cycle 4: a valid poll restores a current reading → Fresh again.
    const recovered = await cycle(stubOk(payload("80.0")), "2026-06-21T15:31:30Z", onError);
    expect(recovered?.outdoorTempF).toBe(80);

    const back = buildLatestSnapshot(readStore, config, new Date("2026-06-21T15:31:35Z"), {
      conditionIcon: null,
      conditionStale: true,
    });
    expect(back.reading?.outdoorTempF).toBe(80);
    expect(deriveFreshness(back.observedAt, Date.parse("2026-06-21T15:31:35Z"), CADENCE_SECONDS)).toBe(
      "fresh",
    );
    expect(errors).toHaveLength(2);
  });
});
