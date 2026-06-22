import { type ConditionIcon } from "@ecowitt/shared";

/** Normalised NWS latest-observation input for the pure mapping. */
export interface NwsObservation {
  /** NWS `textDescription`, e.g. "Partly Cloudy". */
  textDescription: string;
  /** Derived from the NWS icon URL day/night segment. */
  isDaytime: boolean;
}

/** The resolved condition exposed to the latest route. */
export interface ConditionState {
  conditionIcon: ConditionIcon | null;
  conditionStale: boolean;
}

/**
 * Fetch the latest NWS observation. Injected so tests never touch the network
 * (FR-057); the production fetcher lives in `index.ts` (coverage-excluded).
 */
export type ObservationFetcher = (
  userAgent: string,
  signal: AbortSignal,
) => Promise<NwsObservation>;

export interface NwsClient {
  /** The current cached condition (sync, never throws). */
  current(now: Date): ConditionState;
  /** Refresh from NWS when the cache TTL has expired; never throws. */
  refresh(now: Date): Promise<void>;
}

export interface NwsClientOptions {
  fetcher: ObservationFetcher;
  userAgent: string;
  cacheTtlSeconds: number;
  staleAfterSeconds: number;
  timeoutMs: number;
}

/** Weather keywords mapped to icons, in priority order (first match wins). */
const KEYWORD_ICONS: ReadonlyArray<readonly [readonly string[], ConditionIcon]> = [
  [["thunder"], "thunderstorm"],
  [["snow", "sleet", "flurries", "ice"], "snow"],
  [["rain", "drizzle", "shower"], "rainy"],
  [["fog", "haze", "mist", "smoke"], "fog"],
];

/**
 * Pure mapping of an NWS observation to the icon vocabulary (data-model.md §7a):
 * `clear | partly-cloudy | cloudy | fog | rainy | snow | thunderstorm | night`.
 * A clear sky maps to `night` after dark; cloud cover and precipitation are
 * day/night agnostic.
 */
export function conditionIcon(observation: NwsObservation): ConditionIcon {
  const text = observation.textDescription.toLowerCase();
  for (const [keywords, icon] of KEYWORD_ICONS) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return icon;
    }
  }
  if (text.includes("cloud") || text.includes("overcast")) {
    return text.includes("partly") ? "partly-cloudy" : "cloudy";
  }
  return observation.isDaytime ? "clear" : "night";
}

/**
 * Build an offline-first NWS client. The latest route reads `current()`
 * synchronously and triggers `refresh()` in the background; a failed or timed-out
 * fetch keeps the last good icon, which greys (stale) once it ages past
 * `staleAfterSeconds`. The client never throws to the route (FR-033/FR-057).
 */
export function createNwsClient(options: NwsClientOptions): NwsClient {
  let lastGood: { icon: ConditionIcon; atMs: number } | null = null;
  let lastFetchMs = Number.NEGATIVE_INFINITY;

  return {
    current(now) {
      if (lastGood === null) {
        return { conditionIcon: null, conditionStale: true };
      }
      const ageMs = now.getTime() - lastGood.atMs;
      return {
        conditionIcon: lastGood.icon,
        conditionStale: ageMs > options.staleAfterSeconds * 1000,
      };
    },
    async refresh(now) {
      const nowMs = now.getTime();
      if (nowMs - lastFetchMs < options.cacheTtlSeconds * 1000) {
        return;
      }
      lastFetchMs = nowMs;
      try {
        const observation = await options.fetcher(
          options.userAgent,
          AbortSignal.timeout(options.timeoutMs),
        );
        lastGood = { icon: conditionIcon(observation), atMs: nowMs };
      } catch {
        // Keep the last good icon; staleness is decided by age in current().
      }
    },
  };
}

interface PointsResponse {
  properties: { observationStations: string };
}
interface StationsResponse {
  features: Array<{ id: string }>;
}
interface LatestObservationResponse {
  properties: { textDescription: string; icon: string | null };
}

async function getGeoJson<T>(
  url: string,
  userAgent: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<T> {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": userAgent, Accept: "application/geo+json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`NWS ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

/**
 * The production `ObservationFetcher`: resolve the household lat/long to its
 * nearest NWS station and read the latest observation (api.weather.gov, no API
 * key, contact `User-Agent` required). Day/night is taken from the icon URL.
 * `fetchImpl` is injected so the HTTP path is unit-tested without live network.
 */
export function createHttpObservationFetcher(
  lat: number,
  lon: number,
  fetchImpl: typeof fetch,
): ObservationFetcher {
  return async (userAgent, signal) => {
    const points = await getGeoJson<PointsResponse>(
      `https://api.weather.gov/points/${lat},${lon}`,
      userAgent,
      signal,
      fetchImpl,
    );
    const stations = await getGeoJson<StationsResponse>(
      points.properties.observationStations,
      userAgent,
      signal,
      fetchImpl,
    );
    const latest = await getGeoJson<LatestObservationResponse>(
      `${stations.features[0]!.id}/observations/latest`,
      userAgent,
      signal,
      fetchImpl,
    );
    return {
      textDescription: latest.properties.textDescription,
      isDaytime: (latest.properties.icon ?? "").includes("/day/"),
    };
  };
}
