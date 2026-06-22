import { describe, it, expect } from "vitest";
import { fetchLivedata } from "../src/gatewayClient.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchLivedata", () => {
  it("returns the parsed JSON on success", async () => {
    const payload = { common_list: [{ id: "0x02", val: "72.4" }] };
    const fetchImpl = ((): Promise<Response> =>
      Promise.resolve(jsonResponse(payload))) as typeof fetch;

    const result = await fetchLivedata("http://gw.local", 1000, fetchImpl);

    expect(result).toEqual({ ok: true, data: payload });
  });

  it("requests the get_livedata_info endpoint", async () => {
    let calledUrl = "";
    const fetchImpl = ((url: string): Promise<Response> => {
      calledUrl = url;
      return Promise.resolve(jsonResponse({}));
    }) as unknown as typeof fetch;

    await fetchLivedata("http://gw.local", 1000, fetchImpl);

    expect(calledUrl).toBe("http://gw.local/get_livedata_info");
  });

  it("returns a typed failure on a non-2xx response without throwing", async () => {
    const fetchImpl = ((): Promise<Response> =>
      Promise.resolve(jsonResponse({}, 503))) as typeof fetch;

    const result = await fetchLivedata("http://gw.local", 1000, fetchImpl);

    expect(result).toEqual({ ok: false, error: "HTTP 503" });
  });

  it("returns a typed failure on a connection error (Error)", async () => {
    const fetchImpl = ((): Promise<Response> =>
      Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch;

    const result = await fetchLivedata("http://gw.local", 1000, fetchImpl);

    expect(result).toEqual({ ok: false, error: "ECONNREFUSED" });
  });

  it("returns a typed failure on a non-Error rejection", async () => {
    const fetchImpl = ((): Promise<Response> =>
      Promise.reject("boom")) as typeof fetch;

    const result = await fetchLivedata("http://gw.local", 1000, fetchImpl);

    expect(result).toEqual({ ok: false, error: "boom" });
  });

  it("aborts and fails fast when the gateway hangs past the timeout", async () => {
    const hang = ((_url: string, init?: { signal?: AbortSignal }): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      })) as unknown as typeof fetch;

    const result = await fetchLivedata("http://gw.local", 5, hang);

    expect(result.ok).toBe(false);
  });
});
