import { describe, it, expect } from "vitest";
import { fetchCloudRealtime } from "../src/ecowittCloud.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const creds = {
  baseUrl: "https://api.ecowitt.net",
  appKey: "app-key",
  apiKey: "api-key",
  mac: "AA:BB:CC:DD:EE:FF",
  timeoutMs: 1000,
};

describe("fetchCloudRealtime — happy path & request shape", () => {
  it("returns the inner data object on a code:0 envelope", async () => {
    const data = { outdoor: { temperature: { value: "72.3" } } };
    const fetchImpl = ((): Promise<Response> =>
      Promise.resolve(jsonResponse({ code: 0, msg: "success", time: "1", data }))) as typeof fetch;

    const result = await fetchCloudRealtime({ ...creds, fetchImpl });

    expect(result).toEqual({ ok: true, data });
  });

  it("builds the request with credentials, call_back, and display-unit ids", async () => {
    let calledUrl = "";
    const fetchImpl = ((url: string): Promise<Response> => {
      calledUrl = url;
      return Promise.resolve(jsonResponse({ code: 0, msg: "success", data: {} }));
    }) as unknown as typeof fetch;

    await fetchCloudRealtime({ ...creds, fetchImpl });

    const u = new URL(calledUrl);
    expect(u.origin + u.pathname).toBe("https://api.ecowitt.net/api/v3/device/real_time");
    const q = u.searchParams;
    expect(q.get("application_key")).toBe("app-key");
    expect(q.get("api_key")).toBe("api-key");
    expect(q.get("mac")).toBe("AA:BB:CC:DD:EE:FF");
    expect(q.get("call_back")).toBe(
      "outdoor,indoor,solar_and_uvi,rainfall_piezo,wind,pressure",
    );
    expect(q.get("temp_unitid")).toBe("2");
    expect(q.get("wind_speed_unitid")).toBe("9");
    expect(q.get("rainfall_unitid")).toBe("13");
    expect(q.get("pressure_unitid")).toBe("4");
    expect(q.get("solar_irradiance_unitid")).toBe("16");
  });

  it("builds a clean path when the base URL carries a trailing slash", async () => {
    let calledUrl = "";
    const fetchImpl = ((url: string): Promise<Response> => {
      calledUrl = url;
      return Promise.resolve(jsonResponse({ code: 0, msg: "success", data: {} }));
    }) as unknown as typeof fetch;

    await fetchCloudRealtime({ ...creds, baseUrl: "https://api.ecowitt.net/", fetchImpl });

    const u = new URL(calledUrl);
    expect(u.origin + u.pathname).toBe("https://api.ecowitt.net/api/v3/device/real_time");
  });

  it("falls back to the default timeout when none is given", async () => {
    const data = { ok: true };
    const fetchImpl = ((_url: string, init?: { signal?: AbortSignal }): Promise<Response> => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(jsonResponse({ code: 0, msg: "success", data }));
    }) as unknown as typeof fetch;

    const { timeoutMs: _omit, ...noTimeout } = creds;
    const result = await fetchCloudRealtime({ ...noTimeout, fetchImpl });

    expect(result).toEqual({ ok: true, data });
  });
});

describe("fetchCloudRealtime — failure branches (honest degradation)", () => {
  it("surfaces a non-zero code as a typed failure carrying the API message (not thrown)", async () => {
    const fetchImpl = ((): Promise<Response> =>
      Promise.resolve(
        jsonResponse({ code: 40010, msg: "Invalid application Key", data: [] }),
      )) as typeof fetch;

    const result = await fetchCloudRealtime({ ...creds, fetchImpl });

    expect(result).toEqual({ ok: false, error: "Invalid application Key" });
  });

  it("uses a code-based message when a non-zero code omits a string msg", async () => {
    const fetchImpl = ((): Promise<Response> =>
      Promise.resolve(jsonResponse({ code: 40010, data: [] }))) as typeof fetch;

    const result = await fetchCloudRealtime({ ...creds, fetchImpl });

    expect(result).toEqual({ ok: false, error: "code 40010" });
  });

  it("fails when the envelope has no numeric code", async () => {
    const fetchImpl = ((): Promise<Response> =>
      Promise.resolve(jsonResponse({ msg: "weird" }))) as typeof fetch;

    const result = await fetchCloudRealtime({ ...creds, fetchImpl });

    expect(result.ok).toBe(false);
  });

  it("returns a typed failure on a non-2xx response", async () => {
    const fetchImpl = ((): Promise<Response> =>
      Promise.resolve(jsonResponse({}, 503))) as typeof fetch;

    const result = await fetchCloudRealtime({ ...creds, fetchImpl });

    expect(result).toEqual({ ok: false, error: "HTTP 503" });
  });

  it("returns a typed failure on a network error (Error)", async () => {
    const fetchImpl = ((): Promise<Response> =>
      Promise.reject(new Error("ECONNRESET"))) as typeof fetch;

    const result = await fetchCloudRealtime({ ...creds, fetchImpl });

    expect(result).toEqual({ ok: false, error: "ECONNRESET" });
  });

  it("returns a typed failure on a non-Error rejection", async () => {
    const fetchImpl = ((): Promise<Response> =>
      Promise.reject("boom")) as typeof fetch;

    const result = await fetchCloudRealtime({ ...creds, fetchImpl });

    expect(result).toEqual({ ok: false, error: "boom" });
  });

  it("aborts and fails fast when the request hangs past the timeout", async () => {
    const hang = ((_url: string, init?: { signal?: AbortSignal }): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      })) as unknown as typeof fetch;

    const result = await fetchCloudRealtime({ ...creds, timeoutMs: 5, fetchImpl: hang });

    expect(result.ok).toBe(false);
  });
});

