import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fetchSensorsInfo } from "../src/gatewayClient.ts";

function fixture(name: string): unknown {
  const url = new URL(`./fixtures/sensorsInfo/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

const page1 = fixture("page1.json");
const page2 = fixture("page2.json");

/** Fetch stub that routes ?page=2 to page2Body and everything else to page1Body. */
function pagesFetch(
  page1Body: unknown,
  page2Body: unknown,
  status = 200,
): typeof fetch {
  return (async (url: string) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => (url.includes("page=2") ? page2Body : page1Body),
  })) as unknown as typeof fetch;
}

/** The payload is now a bare array of raw sensor entries (no command wrapper). */
function sensorIds(data: unknown): string[] {
  return (data as Array<{ id: string }>).map((s) => s.id);
}

const BASE = "http://gw.local";

describe("fetchSensorsInfo", () => {
  it("merges + dedups both real bare-array pages on success (ok:true)", async () => {
    const result = await fetchSensorsInfo(BASE, 5000, pagesFetch(page1, page2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // page1 dedup → FFFFFFFF, 1242D, FFFFFFFE ; page2 adds A0 (its placeholders dup out).
    expect(sensorIds(result.data)).toEqual(["FFFFFFFF", "1242D", "FFFFFFFE", "A0"]);
  });

  it("keeps a placeholder id spanning both pages only once", async () => {
    const result = await fetchSensorsInfo(BASE, 5000, pagesFetch(page1, page2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sensorIds(result.data).filter((id) => id === "FFFFFFFF")).toHaveLength(1);
  });

  it("returns page-1 sensors (best-effort) when page 2 network-errors", async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes("page=2")) throw new Error("network down");
      return { ok: true, status: 200, json: async () => page1 };
    }) as unknown as typeof fetch;
    const result = await fetchSensorsInfo(BASE, 5000, fetchImpl);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sensorIds(result.data)).toEqual(["FFFFFFFF", "1242D", "FFFFFFFE"]);
  });

  it("skips a non-array (garbage) page 2 and returns page-1 sensors, no throw (FR-002)", async () => {
    const garbagePage2 = { code: -1, msg: "sensors unavailable" };
    const result = await fetchSensorsInfo(BASE, 5000, pagesFetch(page1, garbagePage2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sensorIds(result.data)).toEqual(["FFFFFFFF", "1242D", "FFFFFFFE"]);
  });

  it("skips an empty (non-array) page 1 body but still succeeds with page 2 sensors", async () => {
    const result = await fetchSensorsInfo(BASE, 5000, pagesFetch({ not: "an array" }, page2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // page 1 contributes zero (skipped); page 2's placeholder + registered ids remain.
    expect(sensorIds(result.data)).toEqual(["FFFFFFFF", "A0"]);
  });

  it("aborts and fails fast when page 1 hangs past the timeout", async () => {
    const hang = ((_url: string, init?: { signal?: AbortSignal }): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      })) as unknown as typeof fetch;
    const result = await fetchSensorsInfo(BASE, 5, hang);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/abort/i);
  });

  it("fails cleanly when the fetch rejects with a non-Error value", async () => {
    const fetchImpl = (async () => {
      throw "kaboom"; // non-Error rejection
    }) as unknown as typeof fetch;
    const result = await fetchSensorsInfo(BASE, 5000, fetchImpl);
    expect(result).toEqual({ ok: false, error: "kaboom" });
  });

  it("fails on a non-2xx status", async () => {
    const result = await fetchSensorsInfo(BASE, 5000, pagesFetch(page1, page2, 500));
    expect(result).toEqual({ ok: false, error: "HTTP 500" });
  });

  it("fails on a non-JSON body", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    })) as unknown as typeof fetch;
    const result = await fetchSensorsInfo(BASE, 5000, fetchImpl);
    expect(result.ok).toBe(false);
  });

  it("defaults timeout + fetch to the globals when omitted (no live network)", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = pagesFetch(page1, page2);
    try {
      const result = await fetchSensorsInfo(BASE);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(sensorIds(result.data)).toEqual(["FFFFFFFF", "1242D", "FFFFFFFE", "A0"]);
    } finally {
      globalThis.fetch = original;
    }
  });
});
