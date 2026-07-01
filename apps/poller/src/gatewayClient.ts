export type GatewayResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Default fail-fast timeout for a gateway pull (FR-046). */
export const DEFAULT_GATEWAY_TIMEOUT_MS = 5000;

/**
 * Pull the raw `get_livedata_info` payload from the gateway with an
 * `AbortController` timeout. A hung, unreachable, or error response yields a
 * typed failure (never throws) so the scheduler simply retries next cadence.
 */
export async function fetchLivedata(
  baseUrl: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<GatewayResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/get_livedata_info`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as unknown;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The raw merged `get_sensors_info` payload — a **bare array** of flat sensor
 * entries (the device emits one bare array per page; there is no
 * `{ command:[{ sensor }] }` wrapper). Normalization is done downstream.
 */
export type RawSensorsInfo = unknown[];

/** Fetch one `get_sensors_info` page and return its raw sensor array. */
async function fetchSensorsPage(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<GatewayResult<unknown[]>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as unknown;
    // A page body that is not a bare array (empty, missing, or garbage) is
    // skipped — it contributes zero sensors and never throws (FR-002).
    return { ok: true, data: Array.isArray(body) ? body : [] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Merge two raw sensor arrays, keeping the first occurrence of each `id`. */
function dedupById(sensors: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const sensor of sensors) {
    const key = String((sensor as { id?: unknown }).id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sensor);
  }
  return out;
}

/**
 * Pull both pages of the gateway's `get_sensors_info` endpoint, each under its
 * own fail-fast `AbortController` timeout, and return the merged+deduped raw
 * payload. Page 2 is best-effort: if page 1 succeeds and page 2 fails, page 1's
 * sensors are returned; if page 1 fails, the whole call fails. Mirrors
 * `fetchLivedata` — never throws, so the readings path is never blocked.
 * Per the Single Cross-VLAN Consumer rule, only the poller may call this.
 */
export async function fetchSensorsInfo(
  baseUrl: string,
  timeoutMs = DEFAULT_GATEWAY_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<GatewayResult<RawSensorsInfo>> {
  const page1 = await fetchSensorsPage(
    `${baseUrl}/get_sensors_info?page=1`,
    timeoutMs,
    fetchImpl,
  );
  if (!page1.ok) {
    return { ok: false, error: page1.error };
  }
  const page2 = await fetchSensorsPage(
    `${baseUrl}/get_sensors_info?page=2`,
    timeoutMs,
    fetchImpl,
  );
  const merged = page2.ok ? [...page1.data, ...page2.data] : page1.data;
  return { ok: true, data: dedupById(merged) };
}
