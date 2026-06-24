import { loadPollerConfig } from "./config.ts";
import { openWriteStore } from "./store.ts";
import { runPollCycle, runCloudPollCycle } from "./poll.ts";
import { startScheduler } from "./scheduler.ts";
import { DEFAULT_GATEWAY_TIMEOUT_MS } from "./gatewayClient.ts";

const config = loadPollerConfig(process.env);
const store = openWriteStore(config.sqlitePath);

const onError = (error: string): void => {
  console.error(`[poller] cycle failed: ${error}`);
};

const tick =
  config.source === "cloud"
    ? (): void => {
        void runCloudPollCycle({
          baseUrl: config.ecowittApiBaseUrl!,
          appKey: config.ecowittAppKey!,
          apiKey: config.ecowittApiKey!,
          mac: config.ecowittMac!,
          timeoutMs: DEFAULT_GATEWAY_TIMEOUT_MS,
          fetchImpl: fetch,
          store,
          now: () => new Date(),
          onError,
        });
      }
    : (): void => {
        void runPollCycle({
          baseUrl: config.gatewayBaseUrl!,
          timeoutMs: DEFAULT_GATEWAY_TIMEOUT_MS,
          fetchImpl: fetch,
          store,
          now: () => new Date(),
          onError,
        });
      };

const stop = startScheduler(config.pollCadenceSeconds, tick, (error) => {
  console.error(`[poller] scheduler tick threw: ${String(error)}`);
});

function shutdown(): void {
  stop();
  store.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
