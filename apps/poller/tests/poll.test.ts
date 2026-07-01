import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openWriteStore, type WriteStore } from "../src/store.ts";
import { runPollCycle } from "../src/poll.ts";

/** Fetch stub returning a successful JSON response with the given body. */
function okFetch(body: unknown): typeof fetch {
  return (async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as typeof fetch;
}

/** Fetch stub returning an HTTP error response. */
function errorFetch(status: number): typeof fetch {
  return (async () => ({
    ok: false,
    status,
    json: async () => ({}),
  })) as unknown as typeof fetch;
}

function sensorsFixture(name: string): unknown {
  const url = new URL(`./fixtures/sensorsInfo/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}
const page1 = sensorsFixture("page1.json");
const page2 = sensorsFixture("page2.json");

/**
 * Fetch stub for a full poll cycle: routes `get_livedata_info` to a readings
 * body and `get_sensors_info?page=N` to the static page fixtures (or a caller
 * override). Never touches a live gateway.
 */
function stackFetch(opts: {
  livedata: unknown;
  sensors?: unknown; // override the sensors response body (default: page fixtures)
  sensorsStatus?: number; // non-2xx to fail the health fetch
}): typeof fetch {
  return (async (url: string) => {
    if (url.includes("get_livedata_info")) {
      return { ok: true, status: 200, json: async () => opts.livedata };
    }
    const status = opts.sensorsStatus ?? 200;
    const body = opts.sensors ?? (url.includes("page=2") ? page2 : page1);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  }) as unknown as typeof fetch;
}

function validPayload(): unknown {
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
let store: WriteStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ecowitt-poll-"));
  store = openWriteStore(join(dir, "readings.db"));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("runPollCycle", () => {
  it("persists and returns the reading on a healthy cycle", async () => {
    const errors: string[] = [];
    const reading = await runPollCycle({
      baseUrl: "http://gw.local",
      timeoutMs: 5000,
      fetchImpl: stackFetch({ livedata: validPayload() }),
      store,
      now: () => new Date("2026-06-21T15:30:00Z"),
      onError: (e) => errors.push(e),
    });

    expect(reading?.outdoorTempF).toBe(72.4);
    expect(errors).toEqual([]);
  });

  it("reports the gateway error and skips the store when the fetch fails", async () => {
    const errors: string[] = [];
    const reading = await runPollCycle({
      baseUrl: "http://gw.local",
      timeoutMs: 5000,
      fetchImpl: errorFetch(503),
      store,
      now: () => new Date("2026-06-21T15:30:00Z"),
      onError: (e) => errors.push(e),
    });

    expect(reading).toBeNull();
    expect(errors).toEqual(["HTTP 503"]);
  });

  it("reports a mapping error and skips the store when the payload is malformed", async () => {
    const errors: string[] = [];
    const reading = await runPollCycle({
      baseUrl: "http://gw.local",
      timeoutMs: 5000,
      fetchImpl: okFetch({ not: "a gateway payload" }),
      store,
      now: () => new Date("2026-06-21T15:30:00Z"),
      onError: (e) => errors.push(e),
    });

    expect(reading).toBeNull();
    expect(errors).toHaveLength(1);
  });
});

describe("runPollCycle sensor health (US1 + US4)", () => {
  const NOW = new Date("2026-06-30T14:05:00Z");
  const CAPTURED = NOW.toISOString();

  function healthRow(): { captured_at: string; sensors_json: string } | undefined {
    const db = new Database(join(dir, "readings.db"), { readonly: true });
    const row = db
      .prepare("SELECT captured_at, sensors_json FROM sensor_health WHERE id = 1")
      .get() as { captured_at: string; sensors_json: string } | undefined;
    db.close();
    return row;
  }

  it("fetches, normalizes, and upserts sensor health on a healthy cycle", async () => {
    const errors: string[] = [];
    const reading = await runPollCycle({
      baseUrl: "http://gw.local",
      timeoutMs: 5000,
      fetchImpl: stackFetch({ livedata: validPayload() }),
      store,
      now: () => NOW,
      onError: (e) => errors.push(e),
    });

    expect(reading?.outdoorTempF).toBe(72.4);
    expect(errors).toEqual([]);
    const row = healthRow();
    expect(row?.captured_at).toBe(CAPTURED);
    const sensors = JSON.parse(row!.sensors_json) as Array<{ id: string }>;
    expect(sensors.map((s) => s.id)).toEqual(["1242D", "A0"]);
  });

  it("skips the health upsert but still ingests readings when the health fetch fails", async () => {
    const errors: string[] = [];
    const reading = await runPollCycle({
      baseUrl: "http://gw.local",
      timeoutMs: 5000,
      fetchImpl: stackFetch({ livedata: validPayload(), sensorsStatus: 503 }),
      store,
      now: () => NOW,
      onError: (e) => errors.push(e),
    });

    expect(reading?.outdoorTempF).toBe(72.4); // readings unaffected
    expect(errors).toEqual(["HTTP 503"]); // health failure reported via onError only
    expect(healthRow()).toBeUndefined(); // no upsert
  });

  it("skips the upsert (no error) when normalization yields no registered sensors", async () => {
    const errors: string[] = [];
    const placeholdersOnly = [
      { img: "wh57", type: "18", name: "P", id: "FFFFFFFE", batt: "0", idst: "0" },
    ];
    const reading = await runPollCycle({
      baseUrl: "http://gw.local",
      timeoutMs: 5000,
      fetchImpl: stackFetch({ livedata: validPayload(), sensors: placeholdersOnly }),
      store,
      now: () => NOW,
      onError: (e) => errors.push(e),
    });

    expect(reading?.outdoorTempF).toBe(72.4);
    expect(errors).toEqual([]);
    expect(healthRow()).toBeUndefined();
  });

  it("isolates a garbage (non-array) sensors page — readings intact, no throw, no upsert (FR-012)", async () => {
    const errors: string[] = [];
    const garbageSensors = { code: -1, msg: "sensors unavailable", data: "not an array" };
    const reading = await runPollCycle({
      baseUrl: "http://gw.local",
      timeoutMs: 5000,
      fetchImpl: stackFetch({ livedata: validPayload(), sensors: garbageSensors }),
      store,
      now: () => NOW,
      onError: (e) => errors.push(e),
    });

    // A non-array get_sensors_info body parses to zero sensors (both pages
    // skipped): the readings write path is untouched and nothing propagates.
    expect(reading?.outdoorTempF).toBe(72.4);
    expect(errors).toEqual([]);
    expect(healthRow()).toBeUndefined();
  });

  it("isolates a health-persist failure — never propagates, readings untouched", async () => {
    const errors: string[] = [];
    const throwingStore: WriteStore = {
      insertReading: (observedAt, metrics) => store.insertReading(observedAt, metrics),
      upsertSensorHealth: () => {
        throw new Error("disk full");
      },
      close: () => {},
    };
    const reading = await runPollCycle({
      baseUrl: "http://gw.local",
      timeoutMs: 5000,
      fetchImpl: stackFetch({ livedata: validPayload() }),
      store: throwingStore,
      now: () => NOW,
      onError: (e) => errors.push(e),
    });

    expect(reading?.outdoorTempF).toBe(72.4); // readings ingested before the throw
    expect(errors.some((e) => e.includes("disk full"))).toBe(true);
  });

  it("does not fetch health when the readings fetch fails (no duplicate error)", async () => {
    const errors: string[] = [];
    const reading = await runPollCycle({
      baseUrl: "http://gw.local",
      timeoutMs: 5000,
      fetchImpl: errorFetch(503),
      store,
      now: () => NOW,
      onError: (e) => errors.push(e),
    });

    expect(reading).toBeNull();
    expect(errors).toEqual(["HTTP 503"]); // exactly one error, not two
    expect(healthRow()).toBeUndefined();
  });
});
