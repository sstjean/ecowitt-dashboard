import type { MappedReading } from "@ecowitt/shared";
import { cloudRealtimeToGateway } from "@ecowitt/shared";
import { fetchLivedata } from "./gatewayClient.ts";
import { fetchCloudRealtime } from "./ecowittCloud.ts";
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

export interface CloudPollDeps {
  baseUrl: string;
  appKey: string;
  apiKey: string;
  mac: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  store: WriteStore;
  now: () => Date;
  onError: (error: string) => void;
}

interface IngestSink {
  store: WriteStore;
  now: () => Date;
  onError: (error: string) => void;
}

type FetchResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/**
 * Shared tail of every poll cycle: on a failed fetch, report and skip; on
 * success, translate the raw payload to the gateway shape and ingest. Any throw
 * — from the cloud adapter's schema validation or from `ingestPayload` — is
 * caught here and reported via `onError`, so a partial/malformed payload skips
 * the cycle and leaves the store untouched (never crashes the poller).
 */
async function ingestResult(
  result: FetchResult,
  toGateway: (data: unknown) => unknown,
  sink: IngestSink,
): Promise<MappedReading | null> {
  if (!result.ok) {
    sink.onError(result.error);
    return null;
  }
  try {
    return ingestPayload(toGateway(result.data), { store: sink.store, now: sink.now });
  } catch (err) {
    sink.onError(String(err));
    return null;
  }
}

/**
 * One end-to-end gateway poll: pull the gateway payload, then validate → map →
 * persist. Any failure (unreachable gateway, malformed/partial payload,
 * duplicate observation) is reported via `onError` and leaves the store
 * untouched; the scheduler simply tries again next cadence.
 */
export async function runPollCycle(deps: PollDeps): Promise<MappedReading | null> {
  const result = await fetchLivedata(deps.baseUrl, deps.timeoutMs, deps.fetchImpl);
  return ingestResult(result, (data) => data, deps);
}

/**
 * One end-to-end cloud poll (LiveMock): pull the cloud `real_time` payload,
 * adapt it to the gateway shape, then validate → map → persist through the
 * unchanged downstream pipeline. Fetch failures and adapter/validation throws
 * are reported via `onError` and skip the cycle (honest degradation).
 */
export async function runCloudPollCycle(
  deps: CloudPollDeps,
): Promise<MappedReading | null> {
  const result = await fetchCloudRealtime({
    baseUrl: deps.baseUrl,
    appKey: deps.appKey,
    apiKey: deps.apiKey,
    mac: deps.mac,
    timeoutMs: deps.timeoutMs,
    fetchImpl: deps.fetchImpl,
  });
  return ingestResult(result, cloudRealtimeToGateway, deps);
}
