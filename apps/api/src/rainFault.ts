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
  /**
   * Sustained gate (minutes): the storm signature (piezo gate + proxy quorum)
   * must ALSO hold over the sub-window ending this many minutes before `now`,
   * so a storm's leading edge (signature only just appeared) is suppressed while
   * a sustained dead-gauge downpour still fires (014, FR-014 — see research.md).
   */
  SUSTAIN_MIN: number;
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
  SUSTAIN_MIN: 45,
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
 * Evaluate the storm signature over `samples` whose upper bound is `end` (epoch
 * ms). Returns the fired-proxy list when the sub-window is assessable
 * (≥ `MIN_READINGS` rows AND spans ≥ `TREND_MIN` minutes) AND the piezo gate
 * holds AND ≥ `MIN_PROXIES` of the 5 proxies concur; otherwise `null` (not
 * assessable / gate fails / quorum not met). Pure — `samples` must already be
 * filtered to `t ≤ end`. Composed twice by `detectRainFault` (full window at
 * `now` + earlier sub-window at `now − SUSTAIN_MIN`) with no duplicated logic.
 */
function signatureFired(
  samples: Sample[],
  end: number,
  isDay: boolean,
  th: RainFaultThresholds,
): Array<[string, boolean]> | null {
  if (samples.length < th.MIN_READINGS) return null;
  if ((end - samples[0]!.t) / 60_000 < th.TREND_MIN) return null;
  if (!piezoNearZero(samples, th)) return null;
  const fired: Array<[string, boolean]> = [
    ["temperature crash", tempCrash(samples, th)],
    ["humidity surge", humiditySurge(samples, th)],
    ["gust spike", gustSpike(samples, th)],
    ["pressure dip", pressureDip(samples, th)],
    ["solar collapse", solarCollapse(samples, isDay, th)],
  ];
  if (fired.filter(([, on]) => on).length < th.MIN_PROXIES) return null;
  return fired;
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
  const all = parseWindow(readings).filter((s) => s.t <= now.getTime());

  const nowFired = signatureFired(all, now.getTime(), isDay, thresholds);
  if (nowFired === null) return NOT_SUSPECT;

  // Sustained-duration gate (014): the same signature must ALSO have held over
  // the sub-window ending SUSTAIN_MIN minutes earlier. On a storm's leading edge
  // the signature had not yet appeared 45 min ago, so this suppresses the false
  // positive; a genuinely dead gauge in a sustained downpour still fires because
  // the signature was already established 45 min ago with rain still zero.
  const earlierEnd = now.getTime() - thresholds.SUSTAIN_MIN * 60_000;
  const earlierFired = signatureFired(
    all.filter((s) => s.t <= earlierEnd),
    earlierEnd,
    isDay,
    thresholds,
  );
  if (earlierFired === null) return NOT_SUSPECT;

  return {
    rainSensorSuspect: true,
    rainSensorReason: `Storm signature sustained with no rain measured (${buildReason(nowFired)})`,
  };
}
