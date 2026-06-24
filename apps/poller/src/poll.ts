import type { MappedReading } from "@ecowitt/shared";
import { fetchLivedata } from "./gatewayClient.ts";
import { ingestPayload } from "./ingest.ts";
import type { WriteStore } from "./store.ts";

export interface PollDeps {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  store: WriteStore;
  now: () => Date;
  onError: (error: string) => void;
}

/**
 * One end-to-end poll: pull the gateway payload, then validate → map → persist.
 * Any failure (unreachable gateway, malformed/partial payload, duplicate
 * observation) is reported via `onError` and leaves the store untouched; the
 * scheduler simply tries again next cadence.
 */
export async function runPollCycle(deps: PollDeps): Promise<MappedReading | null> {
  const result = await fetchLivedata(deps.baseUrl, deps.timeoutMs, deps.fetchImpl);
  if (!result.ok) {
    deps.onError(result.error);
    return null;
  }
  try {
    return ingestPayload(result.data, { store: deps.store, now: deps.now });
  } catch (err) {
    deps.onError(String(err));
    return null;
  }
}
