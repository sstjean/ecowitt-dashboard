export type GatewayResult =
  | { ok: true; data: unknown }
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
