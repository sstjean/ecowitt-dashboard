import type { LiveReadingSnapshot } from "@ecowitt/shared";
import type { AstronomicalData } from "@ecowitt/shared";
import * as SunCalc from "suncalc";
import type { StoredReading } from "./store.ts";

/** The four aggregates the API derives from stored history (data-model.md §7b). */
export interface DailyDerived {
  dayHighF: number;
  dayLowF: number;
  windAvg10mMph: number;
  maxDailyGustDir: string;
}

type InstantReading = Omit<LiveReadingSnapshot, keyof DailyDerived>;

const CARDINALS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

const TEN_MINUTES_MS = 10 * 60 * 1000;

/** 16-point compass cardinal for a bearing in degrees. */
export function degToCardinal(deg: number): string {
  return CARDINALS[Math.round(deg / 22.5) % 16]!;
}

/** The UTC instant of the most recent local midnight in `timeZone`. */
export function localDayStartIso(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)!.value);
  // The gateway-local wall clock for `now`, read as if it were UTC, minus the
  // true UTC instant, gives the zone offset; subtract it from local midnight.
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offsetMs = wallAsUtc - now.getTime();
  const localMidnightAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"));
  return new Date(localMidnightAsUtc - offsetMs).toISOString();
}

const num = (v: number | string | undefined): number => Number(v);

/**
 * Derive the daily/rolling aggregates from stored history since local midnight,
 * falling back to the current reading's instantaneous equivalent on a cold
 * start (too little history) rather than fabricating a zero.
 */
export function deriveDaily(
  reading: InstantReading,
  sinceMidnight: StoredReading[],
  now: Date,
): DailyDerived {
  const temps = sinceMidnight.map((r) => num(r.metrics.outdoorTempF));
  const dayHighF = temps.length > 0 ? Math.max(...temps) : reading.outdoorTempF;
  const dayLowF = temps.length > 0 ? Math.min(...temps) : reading.outdoorTempF;

  const cutoff = now.getTime() - TEN_MINUTES_MS;
  const recentWind = sinceMidnight
    .filter((r) => Date.parse(r.observedAt) >= cutoff)
    .map((r) => num(r.metrics.windMph));
  const windAvg10mMph =
    recentWind.length > 0
      ? recentWind.reduce((a, b) => a + b, 0) / recentWind.length
      : reading.windMph;

  let maxGust = -Infinity;
  let gustDir = reading.windDirDeg;
  for (const r of sinceMidnight) {
    const g = num(r.metrics.gustMph);
    if (g > maxGust) {
      maxGust = g;
      gustDir = num(r.metrics.windDirDeg);
    }
  }
  const maxDailyGustDir = degToCardinal(gustDir);

  return { dayHighF, dayLowF, windAvg10mMph, maxDailyGustDir };
}

/**
 * SunCalc-derived sun/moon context (offline, deterministic). `sunAltitudeFraction`
 * is the sun's altitude as a 0–1 fraction of the zenith, clamped to 0 below the
 * horizon so the solar arc reads empty overnight.
 */
export function computeAstro(lat: number, lon: number, now: Date): AstronomicalData {
  const times = SunCalc.getTimes(now, lat, lon);
  const position = SunCalc.getPosition(now, lat, lon);
  const illumination = SunCalc.getMoonIllumination(now);
  const sunAltitudeFraction = Math.max(
    0,
    Math.min(1, position.altitude / (Math.PI / 2)),
  );
  return {
    // The household is non-polar, so sunrise/sunset are always defined
    // (SunCalc only returns null for latitudes with no sunrise/sunset).
    sunriseUtc: times.sunrise!.toISOString(),
    sunsetUtc: times.sunset!.toISOString(),
    sunAltitudeFraction,
    moonPhase: illumination.phase,
  };
}
