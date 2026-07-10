import type { StoredReading } from "../../../src/store.ts";
import { RAIN_FAULT_DEFAULTS } from "../../../src/rainFault.ts";

/** Rolling-trend span (minutes) the detector measures each drop/rise over. */
const TREND_MIN = RAIN_FAULT_DEFAULTS.TREND_MIN;
/**
 * Default window span (minutes) for the positive builders. Must be
 * ≥ `SUSTAIN_MIN + TREND_MIN` so the sustained-gate sub-window ending
 * `now − SUSTAIN_MIN` is itself assessable (spans ≥ `TREND_MIN`) and fires the
 * same signature — i.e. the positives survive the 014 sustained gate.
 */
const DEFAULT_SPAN_MIN = 90;

/**
 * Pure, deterministic fixture builders for the rain-fault detector boundary and
 * edge tests. Every call returns a FRESH `StoredReading[]` (no shared mutable
 * state). Each configured drop/rise/collapse is applied as a **per-`TREND_MIN`
 * (30-min) rate** ramped continuously across the whole span, so ANY 30-min
 * rolling delta equals exactly the configured value regardless of `spanMin`
 * (`solarWm2` is clamped at 0). Windows therefore span the sustained
 * `DEFAULT_SPAN_MIN` by default while every proxy verdict stays identical to a
 * single 30-min ramp. All non-firing defaults are zero, so a builder fires only
 * the proxies a test explicitly configures.
 */
export interface WindowOpts {
  /** Number of readings in the window (default 7). */
  count?: number;
  /**
   * Total span of the window in minutes (default `DEFAULT_SPAN_MIN` = 90, so the
   * `now − SUSTAIN_MIN` sub-window is assessable). Each configured delta is a
   * per-`TREND_MIN` rate, so the span does not change any 30-min rolling delta.
   */
  spanMin?: number;
  /** ISO start instant of the first reading (default 2026-06-28T21:00:00Z). */
  startIso?: string;
  /** Outdoor temperature at the first reading (default 70). */
  tempStart?: number;
  /** Temperature drop per `TREND_MIN` span (°F, default 0). */
  tempDrop?: number;
  /** Outdoor humidity at the first reading (default 50). */
  humStart?: number;
  /** Humidity rise per `TREND_MIN` span (%pts, default 0). */
  humSurge?: number;
  /** Pressure at the first reading (hPa, default 1015). */
  pressStart?: number;
  /** Pressure drop per `TREND_MIN` span (hPa, default 0). */
  pressDip?: number;
  /** Constant wind gust — becomes the window max (mph, default 0). */
  gust?: number;
  /** Solar radiation peak at the first reading (W/m², default 0 ⇒ no solar). */
  solarPeak?: number;
  /** Fractional solar collapse from the peak per `TREND_MIN` span (default 0). */
  solarFrac?: number;
  /** Constant piezo rain rate (in/hr, default 0). */
  rateMax?: number;
  /** Piezo event accumulation rise per `TREND_MIN` span (in, default 0). */
  eventRise?: number;
  /** Residual Ambient tipping-bucket ghost value — must be ignored (default 0.42). */
  ghost?: number;
}

const DEFAULT_START = "2026-06-28T21:00:00.000Z";

/** Build a fresh window with per-TREND_MIN linear ramps; each call is independent. */
export function buildReadings(opts: WindowOpts = {}): StoredReading[] {
  const {
    count = 7,
    spanMin = DEFAULT_SPAN_MIN,
    startIso = DEFAULT_START,
    tempStart = 70,
    tempDrop = 0,
    humStart = 50,
    humSurge = 0,
    pressStart = 1015,
    pressDip = 0,
    gust = 0,
    solarPeak = 0,
    solarFrac = 0,
    rateMax = 0,
    eventRise = 0,
    ghost = 0.42,
  } = opts;
  const startMs = Date.parse(startIso);
  const out: StoredReading[] = [];
  for (let i = 0; i < count; i += 1) {
    const f = count === 1 ? 0 : i / (count - 1);
    const elapsedMin = f * spanMin;
    // Number of TREND_MIN spans elapsed — each configured delta is a rate over
    // this span, so any 30-min rolling delta equals the configured value.
    const spans = elapsedMin / TREND_MIN;
    const tMs = startMs + elapsedMin * 60_000;
    out.push({
      observedAt: new Date(tMs).toISOString(),
      metrics: {
        outdoorTempF: tempStart - tempDrop * spans,
        dewpointF: tempStart - tempDrop * spans - 2,
        outdoorHumidityPct: humStart + humSurge * spans,
        gustMph: gust,
        pressureHpa: pressStart - pressDip * spans,
        solarWm2: Math.max(0, solarPeak * (1 - solarFrac * spans)),
        rainRateInHr: rateMax,
        rainEventIn: eventRise * spans,
        rainDailyIn: eventRise * spans,
        rain_0x0D: ghost,
      },
    });
  }
  return out;
}

/** The `now` a test should pass: the instant of the window's last reading. */
export function windowNow(window: StoredReading[]): Date {
  return new Date(window[window.length - 1]!.observedAt);
}

/**
 * A daytime window where all 5 proxies fire and the piezo is dead-zero — the
 * canonical positive case. Pass overrides to nudge a single threshold.
 */
export function stormWindow(overrides: WindowOpts = {}): StoredReading[] {
  return buildReadings({
    tempDrop: 12,
    humSurge: 18,
    gust: 16,
    pressDip: 1.3,
    solarPeak: 700,
    solarFrac: 0.75,
    rateMax: 0,
    eventRise: 0,
    ...overrides,
  });
}

/**
 * A night window firing exactly the 4 dynamics proxies (solar off) with a dead
 * piezo — reaches the quorum without the solar proxy (C5).
 */
export function nightStormWindow(overrides: WindowOpts = {}): StoredReading[] {
  return buildReadings({
    tempDrop: 12,
    humSurge: 18,
    gust: 16,
    pressDip: 1.3,
    solarPeak: 0,
    solarFrac: 0,
    ...overrides,
  });
}

/**
 * A night window firing exactly three dynamics proxies (gust + pressure +
 * humidity, no temp crash) with a dead piezo — one short of the quorum (C3).
 */
export function threeProxyWindow(overrides: WindowOpts = {}): StoredReading[] {
  return buildReadings({
    tempDrop: 0,
    humSurge: 18,
    gust: 16,
    pressDip: 1.3,
    solarPeak: 0,
    ...overrides,
  });
}

/**
 * A calm overnight saturation window: humidity ≈99%, no dynamics, dead piezo —
 * the gate passes but zero proxies fire (C6).
 */
export function calmSaturationWindow(overrides: WindowOpts = {}): StoredReading[] {
  return buildReadings({
    tempStart: 60,
    tempDrop: 0,
    humStart: 99,
    humSurge: 0,
    gust: 1,
    pressDip: 0,
    solarPeak: 0,
    rateMax: 0,
    eventRise: 0,
    ...overrides,
  });
}

/** Fixed `now` anchor for the approaching-storm windows (daytime). */
const APPROACH_NOW = "2026-07-06T21:00:00.000Z";
/** Total rolling-window span (minutes) of an approaching-storm window. */
const APPROACH_TOTAL_MIN = 90;

/**
 * A leading-edge window: flat pre-storm calm for the earlier part, then the full
 * storm signature (temp crash + humidity surge + gust spike + pressure dip +
 * daytime solar collapse, dead piezo) ramping in over ONLY the last `stormMin`
 * minutes ending at `now`. When `stormMin < SUSTAIN_MIN` the `now − SUSTAIN_MIN`
 * sub-window lands in the calm prefix (below quorum) so the sustained gate
 * suppresses the false positive; when `stormMin ≥ SUSTAIN_MIN` the sub-window
 * catches the established storm and it fires. `overrides` tune the storm segment.
 */
export function approachingStormWindow(
  stormMin: number,
  overrides: WindowOpts = {},
): StoredReading[] {
  const nowMs = Date.parse(APPROACH_NOW);
  const startIso = new Date(nowMs - APPROACH_TOTAL_MIN * 60_000).toISOString();
  const stormStartIso = new Date(nowMs - stormMin * 60_000).toISOString();
  const calm = buildReadings({
    spanMin: APPROACH_TOTAL_MIN - stormMin,
    startIso,
    tempStart: 90,
    humStart: 50,
    pressStart: 1015,
    solarPeak: 900,
    gust: 3,
  });
  const surge = buildReadings({
    spanMin: stormMin,
    startIso: stormStartIso,
    tempStart: 90,
    tempDrop: 12,
    humStart: 50,
    humSurge: 18,
    pressStart: 1015,
    pressDip: 1.3,
    solarPeak: 900,
    solarFrac: 0.75,
    gust: 16,
    ...overrides,
  });
  return [...calm, ...surge];
}
