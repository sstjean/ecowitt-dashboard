import { type ConditionIcon } from "@ecowitt/shared";

/** Normalised NWS latest-observation input for the pure mapping. */
export interface NwsObservation {
  /** NWS `textDescription`, e.g. "Partly Cloudy" (the supported, non-deprecated field). */
  textDescription: string;
}

/**
 * The cached condition exposed to the latest route. Carries the raw NWS text
 * (day/night-agnostic); the icon is resolved at read time from the household
 * astro window (see `resolveConditionIcon`), so the client stores no icon.
 * `hasObservation` distinguishes a cold start (no successful fetch yet) from a
 * successful fetch that happened to return empty text.
 */
export interface ConditionState {
  /** Verbatim NWS label; null before the first good fetch (or "" when the fetch had none). */
  conditionText: string | null;
  conditionStale: boolean;
  hasObservation: boolean;
}

/**
 * Fetch the latest NWS observation. Injected so tests never touch the network
 * (FR-010); the production fetcher lives in `index.ts` (coverage-excluded).
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
 * Decide day vs night for the condition icon from the household's own astro
 * window (FR-001), using a half-open `[sunrise, sunset)` interval: the exact
 * sunrise instant counts as day and the exact sunset instant as night, applied
 * consistently. Total function over the injected ISO instants — never throws.
 */
export function isDaytime(now: Date, sunriseUtc: string, sunsetUtc: string): boolean {
  const t = now.getTime();
  return t >= Date.parse(sunriseUtc) && t < Date.parse(sunsetUtc);
}

/**
 * Pure mapping of NWS text + the household astro window to the icon vocabulary
 * (data-model.md §5): `clear | partly-cloudy | cloudy | fog | rainy | snow |
 * thunderstorm | night`. Keyword and cloud-cover precedence is day/night
 * agnostic (FR-008); only a clear or empty sky consults `isDaytime`, mapping to
 * `clear` by day and `night` after dark (FR-005). Never consults the deprecated
 * NWS `icon` URL (FR-002/FR-003).
 */
export function resolveConditionIcon(
  textDescription: string,
  now: Date,
  sunriseUtc: string,
  sunsetUtc: string,
): ConditionIcon {
  const text = textDescription.toLowerCase();
  for (const [keywords, icon] of KEYWORD_ICONS) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return icon;
    }
  }
  if (text.includes("cloud") || text.includes("overcast")) {
    return text.includes("partly") ? "partly-cloudy" : "cloudy";
  }
  return isDaytime(now, sunriseUtc, sunsetUtc) ? "clear" : "night";
}

/**
 * Build an offline-first NWS client. The latest route reads `current()`
 * synchronously and triggers `refresh()` in the background; a failed or timed-out
 * fetch keeps the last good text, which greys (stale) once it ages past
 * `staleAfterSeconds`. The icon itself is resolved from astro at read time by the
 * route (`resolveConditionIcon`), not stored here. The client never throws to the
 * route.
 */
export function createNwsClient(options: NwsClientOptions): NwsClient {
  let lastGood: { text: string; atMs: number } | null = null;
  let lastFetchMs = Number.NEGATIVE_INFINITY;

  return {
    current(now) {
      if (lastGood === null) {
        return { conditionText: null, conditionStale: true, hasObservation: false };
      }
      const ageMs = now.getTime() - lastGood.atMs;
      return {
        conditionText: lastGood.text,
        conditionStale: ageMs > options.staleAfterSeconds * 1000,
        hasObservation: true,
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
        lastGood = { text: observation.textDescription, atMs: nowMs };
      } catch {
        // Keep the last good text; staleness is decided by age in current().
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
  properties: { textDescription?: string };
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
 * key, contact `User-Agent` required). Only the supported `textDescription` is
 * consumed (coerced to "" when absent); the deprecated `icon` URL is ignored
 * (FR-002/FR-003). `fetchImpl` is injected so the HTTP path is unit-tested
 * without live network.
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
    return { textDescription: latest.properties.textDescription ?? "" };
  };
}
