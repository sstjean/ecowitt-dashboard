import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      fetchImpl: okFetch(validPayload()),
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
