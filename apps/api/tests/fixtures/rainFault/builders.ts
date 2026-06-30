import type { StoredReading } from "../../../src/store.ts";

/**
 * Pure, deterministic fixture builders for the rain-fault detector boundary and
 * edge tests. Every call returns a FRESH `StoredReading[]` (no shared mutable
 * state). Values ramp linearly across the window so each 30-minute rolling delta
 * equals exactly the configured drop/rise (the default span is < `TREND_MIN`, so
 * the whole window is one trend span). All non-firing defaults are zero, so a
 * builder fires only the proxies a test explicitly configures.
 */
export interface WindowOpts {
  /** Number of readings in the window (default 7). */
  count?: number;
  /**
   * Total span of the window in minutes (default 30 = TREND_MIN, so the window
   * is assessable AND the whole linear ramp registers as a single 30-min delta).
   */
  spanMin?: number;
  /** ISO start instant of the first reading (default 2026-06-28T21:00:00Z). */
  startIso?: string;
  /** Outdoor temperature at the first reading (default 70). */
  tempStart?: number;
  /** Total temperature drop across the window (°F, default 0). */
  tempDrop?: number;
  /** Outdoor humidity at the first reading (default 50). */
  humStart?: number;
  /** Total humidity rise across the window (%pts, default 0). */
  humSurge?: number;
  /** Pressure at the first reading (hPa, default 1015). */
  pressStart?: number;
  /** Total pressure drop across the window (hPa, default 0). */
  pressDip?: number;
  /** Constant wind gust — becomes the window max (mph, default 0). */
  gust?: number;
  /** Solar radiation peak at the first reading (W/m², default 0 ⇒ no solar). */
  solarPeak?: number;
  /** Fractional solar collapse from the peak across the window (default 0). */
  solarFrac?: number;
  /** Constant piezo rain rate (in/hr, default 0). */
  rateMax?: number;
  /** Total piezo event accumulation rise across the window (in, default 0). */
  eventRise?: number;
  /** Residual Ambient tipping-bucket ghost value — must be ignored (default 0.42). */
  ghost?: number;
}

const DEFAULT_START = "2026-06-28T21:00:00.000Z";

/** Build a fresh window with linear ramps; each call is independent. */
export function buildReadings(opts: WindowOpts = {}): StoredReading[] {
  const {
    count = 7,
    spanMin = 30,
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
    const tMs = startMs + f * spanMin * 60_000;
    out.push({
      observedAt: new Date(tMs).toISOString(),
      metrics: {
        outdoorTempF: tempStart - tempDrop * f,
        dewpointF: tempStart - tempDrop * f - 2,
        outdoorHumidityPct: humStart + humSurge * f,
        gustMph: gust,
        pressureHpa: pressStart - pressDip * f,
        solarWm2: solarPeak * (1 - solarFrac * f),
        rainRateInHr: rateMax,
        rainEventIn: eventRise * f,
        rainDailyIn: eventRise * f,
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
