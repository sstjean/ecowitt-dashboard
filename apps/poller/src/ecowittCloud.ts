import { DEFAULT_GATEWAY_TIMEOUT_MS } from "./gatewayClient.ts";

export type CloudResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export interface CloudFetchOptions {
  baseUrl: string;
  appKey: string;
  apiKey: string;
  mac: string;
  timeoutMs?: number;
  fetchImpl: typeof fetch;
}

/** Groups requested from the cloud `real_time` endpoint (trimmed CSV, D9). */
const CALL_BACK = "outdoor,indoor,solar_and_uvi,rainfall_piezo,wind,pressure";

/** Display-unit ids so the cloud payload matches the gateway mapper's units. */
const UNIT_PARAMS: Record<string, string> = {
  temp_unitid: "2", // ℉
  wind_speed_unitid: "9", // mph
  rainfall_unitid: "13", // in
  pressure_unitid: "4", // inHg (mapper requires inHg)
  solar_irradiance_unitid: "16", // W/m²
};

function buildUrl(opts: CloudFetchOptions): string {
  const url = new URL("/api/v3/device/real_time", opts.baseUrl);
  url.searchParams.set("application_key", opts.appKey);
  url.searchParams.set("api_key", opts.apiKey);
  url.searchParams.set("mac", opts.mac);
  url.searchParams.set("call_back", CALL_BACK);
  for (const [key, value] of Object.entries(UNIT_PARAMS)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Pull the cloud `real_time` payload with an `AbortController` timeout, mirroring
 * the gateway client's typed `{ ok, data } | { ok, error }` contract — it never
 * throws. On the `code:0` success envelope it returns the inner `data` object
 * (handed to `cloudRealtimeToGateway`); a non-zero `code`, HTTP error, network
 * error, or timeout is surfaced as a typed failure (the cycle is skipped).
 */
export async function fetchCloudRealtime(
  opts: CloudFetchOptions,
): Promise<CloudResult> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_GATEWAY_TIMEOUT_MS,
  );
  try {
    const res = await opts.fetchImpl(buildUrl(opts), { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as { code?: unknown; msg?: unknown; data?: unknown };
    if (typeof body.code !== "number") {
      return { ok: false, error: "malformed cloud response (no code)" };
    }
    if (body.code !== 0) {
      const msg = typeof body.msg === "string" ? body.msg : `code ${body.code}`;
      return { ok: false, error: msg };
    }
    return { ok: true, data: body.data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
