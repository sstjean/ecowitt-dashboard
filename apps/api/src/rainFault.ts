import type { RainFaultState } from "@ecowitt/shared";
import type { StoredReading } from "./store.ts";

/**
 * Tunable thresholds for the rain-gauge "not measuring" fault heuristic. Every
 * magic number lives here (no literals in the logic) so the detector can be
 * re-tuned without touching control flow.
 */
export interface RainFaultThresholds {
  /** Min temperature drop over a TREND_MIN span to fire the temp-crash proxy (°F). */
  TEMP_DROP_F: number;
  /** Min humidity rise over a TREND_MIN span to fire the humidity-surge proxy (%pts). */
  HUMIDITY_SURGE_PCT: number;
  /** Min window-max gust to fire the gust-spike proxy (mph). */
  GUST_SPIKE_MPH: number;
  /** Min pressure drop over a TREND_MIN span to fire the pressure-dip proxy (hPa). */
  PRESSURE_DIP_HPA: number;
  /** Fraction of the window solar peak the solar must drop to fire the collapse proxy. */
  SOLAR_COLLAPSE_FRAC: number;
  /** Daytime cross-check: the window solar peak must reach this to be a meaningful collapse (W/m²). */
  SOLAR_DAY_MIN_WM2: number;
  /** Piezo gate: max rain rate at or below this counts as "near zero" (in/hr). */
  PIEZO_RATE_EPS: number;
  /** Piezo gate: max event accumulation rise over a TREND_MIN span at or below this counts as "near zero" (in). */
  PIEZO_EVENT_EPS: number;
  /** Rolling trend span for the drop/rise scans (minutes); also the minimum window span. */
  TREND_MIN: number;
  /** Minimum readings the window must contain to be assessable. */
  MIN_READINGS: number;
  /** Quorum: the number of the 5 proxies that must concur for a fault. */
  MIN_PROXIES: number;
}

/** Empirically derived defaults (see specs/008 research.md / data-model.md). */
export const RAIN_FAULT_DEFAULTS: RainFaultThresholds = {
  TEMP_DROP_F: 6.0,
  HUMIDITY_SURGE_PCT: 10.0,
  GUST_SPIKE_MPH: 8.0,
  PRESSURE_DIP_HPA: 0.8,
  SOLAR_COLLAPSE_FRAC: 0.5,
  SOLAR_DAY_MIN_WM2: 50.0,
  PIEZO_RATE_EPS: 0.01,
  PIEZO_EVENT_EPS: 0.01,
  TREND_MIN: 30,
  MIN_READINGS: 4,
  MIN_PROXIES: 4,
};

const NOT_SUSPECT: RainFaultState = { rainSensorSuspect: false, rainSensorReason: null };

/** One time-stamped sample of the metrics the detector reasons over. */
interface Sample {
  t: number;
  outdoorTempF: number | null;
  outdoorHumidityPct: number | null;
  gustMph: number | null;
  pressureHpa: number | null;
  solarWm2: number | null;
  rainRateInHr: number | null;
  rainEventIn: number | null;
}

/** Coerce a FullMetricMap value (number | string | undefined) to a finite number or null. */
function toNum(v: number | string | undefined): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Parse the stored window into time-ordered numeric samples (Ambient rain_0x* never read). */
function parseWindow(readings: StoredReading[]): Sample[] {
  return readings
    .map((r) => ({
      t: Date.parse(r.observedAt),
      outdoorTempF: toNum(r.metrics.outdoorTempF),
      outdoorHumidityPct: toNum(r.metrics.outdoorHumidityPct),
      gustMph: toNum(r.metrics.gustMph),
      pressureHpa: toNum(r.metrics.pressureHpa),
      solarWm2: toNum(r.metrics.solarWm2),
      rainRateInHr: toNum(r.metrics.rainRateInHr),
      rainEventIn: toNum(r.metrics.rainEventIn),
    }))
    .filter((s) => Number.isFinite(s.t))
    .sort((a, b) => a.t - b.t);
}

/**
 * Shared rolling-delta scan (DRY): the largest `later − earlier` (rise) or
 * `earlier − later` (drop) between any two samples no more than `spanMin`
 * minutes apart. Nulls are skipped; never negative (floored at 0).
 */
function maxRollingDelta(
  samples: Sample[],
  pick: (s: Sample) => number | null,
  spanMin: number,
  kind: "drop" | "rise",
): number {
  const spanMs = spanMin * 60_000;
  let best = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const a = pick(samples[i]!);
    if (a === null) continue;
    for (let j = i + 1; j < samples.length; j += 1) {
      if (samples[j]!.t - samples[i]!.t > spanMs) break;
      const b = pick(samples[j]!);
      if (b === null) continue;
      best = Math.max(best, kind === "drop" ? a - b : b - a);
    }
  }
  return best;
}

const maxDropOverSpan = (samples: Sample[], pick: (s: Sample) => number | null, spanMin: number) =>
  maxRollingDelta(samples, pick, spanMin, "drop");
const maxRiseOverSpan = (samples: Sample[], pick: (s: Sample) => number | null, spanMin: number) =>
  maxRollingDelta(samples, pick, spanMin, "rise");

/** Window max of a metric (skipping nulls); 0 when the metric is absent. */
function windowMax(samples: Sample[], pick: (s: Sample) => number | null): number {
  let best = 0;
  let seen = false;
  for (const s of samples) {
    const v = pick(s);
    if (v === null) continue;
    best = seen ? Math.max(best, v) : v;
    seen = true;
  }
  return seen ? best : 0;
}

// --- Per-signal proxies (SRP) ------------------------------------------------

function tempCrash(samples: Sample[], th: RainFaultThresholds): boolean {
  return maxDropOverSpan(samples, (s) => s.outdoorTempF, th.TREND_MIN) >= th.TEMP_DROP_F;
}

function humiditySurge(samples: Sample[], th: RainFaultThresholds): boolean {
  return maxRiseOverSpan(samples, (s) => s.outdoorHumidityPct, th.TREND_MIN) >= th.HUMIDITY_SURGE_PCT;
}

function gustSpike(samples: Sample[], th: RainFaultThresholds): boolean {
  return windowMax(samples, (s) => s.gustMph) >= th.GUST_SPIKE_MPH;
}

function pressureDip(samples: Sample[], th: RainFaultThresholds): boolean {
  return maxDropOverSpan(samples, (s) => s.pressureHpa, th.TREND_MIN) >= th.PRESSURE_DIP_HPA;
}

function solarCollapse(samples: Sample[], isDay: boolean, th: RainFaultThresholds): boolean {
  if (!isDay) return false;
  const peak = windowMax(samples, (s) => s.solarWm2);
  if (peak < th.SOLAR_DAY_MIN_WM2) return false;
  const drop = maxDropOverSpan(samples, (s) => s.solarWm2, th.TREND_MIN);
  return drop / peak >= th.SOLAR_COLLAPSE_FRAC;
}

/** The mandatory gate: the WS90 piezo channel is effectively reporting no rain. */
function piezoNearZero(samples: Sample[], th: RainFaultThresholds): boolean {
  const rateMax = windowMax(samples, (s) => s.rainRateInHr);
  const eventRise = maxRiseOverSpan(samples, (s) => s.rainEventIn, th.TREND_MIN);
  return rateMax <= th.PIEZO_RATE_EPS && eventRise <= th.PIEZO_EVENT_EPS;
}

/** Compose the human-readable reason from the proxies that fired. */
function buildReason(fired: Array<[string, boolean]>): string {
  return fired
    .filter(([, on]) => on)
    .map(([label]) => label)
    .join(", ");
}

/**
 * Detect a suspected rain-gauge "not measuring" fault over a rolling window.
 *
 * A fault is raised only when the piezo **gate** holds (the WS90 rain channel is
 * effectively zero) AND a **quorum** of at least `MIN_PROXIES` of the 5 storm
 * proxies concur — temperature crash, humidity surge, gust spike, pressure dip,
 * and (daytime-only) solar collapse. Calm overnight saturation never reaches the
 * quorum, and a genuinely measuring gauge never passes the gate. Pure and
 * local-only: no NWS / precipitation cross-check (FR-012).
 */
export function detectRainFault(
  readings: StoredReading[],
  now: Date,
  isDay: boolean,
  thresholds: RainFaultThresholds = RAIN_FAULT_DEFAULTS,
): RainFaultState {
  const samples = parseWindow(readings).filter((s) => s.t <= now.getTime());
  if (samples.length < thresholds.MIN_READINGS) return NOT_SUSPECT;
  const spanMin = (now.getTime() - samples[0]!.t) / 60_000;
  if (spanMin < thresholds.TREND_MIN) return NOT_SUSPECT;

  if (!piezoNearZero(samples, thresholds)) return NOT_SUSPECT;

  const fired: Array<[string, boolean]> = [
    ["temperature crash", tempCrash(samples, thresholds)],
    ["humidity surge", humiditySurge(samples, thresholds)],
    ["gust spike", gustSpike(samples, thresholds)],
    ["pressure dip", pressureDip(samples, thresholds)],
    ["solar collapse", solarCollapse(samples, isDay, thresholds)],
  ];
  const concurring = fired.filter(([, on]) => on).length;
  if (concurring < thresholds.MIN_PROXIES) return NOT_SUSPECT;

  return {
    rainSensorSuspect: true,
    rainSensorReason: `Storm signature with no rain measured (${buildReason(fired)})`,
  };
}
