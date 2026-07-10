import { describe, it, expect } from "vitest";
import { detectRainFault, RAIN_FAULT_DEFAULTS } from "../src/rainFault.ts";
import type { StoredReading } from "../src/store.ts";
import {
  buildReadings,
  windowNow,
  stormWindow,
  nightStormWindow,
  threeProxyWindow,
  calmSaturationWindow,
  approachingStormWindow,
} from "./fixtures/rainFault/builders.ts";
import stormFixture from "./fixtures/rainFault/storm-06-28.json" with { type: "json" };
import rainFixture from "./fixtures/rainFault/rain-06-27.json" with { type: "json" };
import dewGateFixture from "./fixtures/rainFault/dew-06-28-gate.json" with { type: "json" };
import dewCalmFixture from "./fixtures/rainFault/dew-06-28-calm.json" with { type: "json" };
import leadingEdgeFixture from "./fixtures/rainFault/leading-edge-07-06.json" with { type: "json" };

const storm = stormFixture as StoredReading[];
const rain = rainFixture as StoredReading[];
const dewGate = dewGateFixture as StoredReading[];
const dewCalm = dewCalmFixture as StoredReading[];
const leadingEdge = leadingEdgeFixture as StoredReading[];

/** The instant of a fixture window's last reading (the window upper bound). */
function lastNow(window: StoredReading[]): Date {
  return new Date(window[window.length - 1]!.observedAt);
}

describe("detectRainFault — captured real windows (US1)", () => {
  it("flags the 06-28 storm (5 proxies, dead piezo) as suspect with a reason", () => {
    const result = detectRainFault(storm, lastNow(storm), true);
    expect(result.rainSensorSuspect).toBe(true);
    expect(result.rainSensorReason).toEqual(expect.any(String));
    expect(result.rainSensorReason).not.toBe("");
  });

  it("does NOT flag the 06-27 measured-drizzle window (gate fails)", () => {
    const result = detectRainFault(rain, lastNow(rain), true);
    expect(result).toEqual({ rainSensorSuspect: false, rainSensorReason: null });
  });

  it("names the fired signals in the reason string", () => {
    const reason = detectRainFault(storm, lastNow(storm), true).rainSensorReason ?? "";
    expect(reason.toLowerCase()).toContain("gust");
  });

  it("ignores the Ambient rain_0x* ghost field (keys only off WS90 piezo, FR-002)", () => {
    // Storm dynamics + dead piezo, but a large residual tipping-bucket ghost. If the
    // detector wrongly read rain_0x*, it would think the gauge measured rain.
    const window = stormWindow({ ghost: 9.99, rateMax: 0, eventRise: 0 });
    expect(detectRainFault(window, windowNow(window), true).rainSensorSuspect).toBe(true);
  });

  it("degrades to { false, null } when the window spans < TREND_MIN minutes", () => {
    const window = stormWindow({ spanMin: RAIN_FAULT_DEFAULTS.TREND_MIN - 1 });
    expect(detectRainFault(window, windowNow(window), true)).toEqual({
      rainSensorSuspect: false,
      rainSensorReason: null,
    });
  });

  it("degrades to { false, null } when the window has < MIN_READINGS rows", () => {
    const window = stormWindow({ count: RAIN_FAULT_DEFAULTS.MIN_READINGS - 1, spanMin: 31 });
    expect(detectRainFault(window, windowNow(window), true)).toEqual({
      rainSensorSuspect: false,
      rainSensorReason: null,
    });
  });

  it("degrades to { false, null } on an empty window", () => {
    expect(detectRainFault([], new Date("2026-06-28T22:00:00Z"), true)).toEqual({
      rainSensorSuspect: false,
      rainSensorReason: null,
    });
  });
});

describe("detectRainFault — sustained-duration gate (US1, 014)", () => {
  it("does NOT flag the 07-06 leading edge — the signature only just appeared (C9, SC-001)", () => {
    // Real capture ending ~17:10 EDT, minutes before the 17:15 rain onset. The
    // full storm signature has fired (008 would raise TRUE), but 45 min earlier
    // the temp had not yet crashed → the now-45 sub-window is below quorum, so
    // the sustained gate suppresses the false positive.
    const result = detectRainFault(leadingEdge, lastNow(leadingEdge), true);
    expect(result.rainSensorSuspect).toBe(false);
    expect(result.rainSensorReason).toBe(null);
  });

  it("degrades to { false, null } when the earlier sub-window is too short/sparse (C10, FR-013)", () => {
    // The full window fires the signature, but the slice ending now-45 spans only
    // ~15 min (< TREND_MIN) with < MIN_READINGS rows, so persistence cannot be
    // confirmed → no fault raised (graceful degradation, no exception).
    const window = stormWindow({ spanMin: 60 });
    expect(detectRainFault(window, windowNow(window), true)).toEqual({
      rainSensorSuspect: false,
      rainSensorReason: null,
    });
  });

  it("SUSTAIN_MIN governs the sustained sub-window boundary (FR-014)", () => {
    // A storm concentrated in the last 60 min. Under the default 45-min gate the
    // now-45 sub-window is still below quorum (storm barely begun) → suppressed;
    // shrinking SUSTAIN_MIN to 15 catches the established storm → fires. The
    // verdict tracks the tunable, proving it is not a magic literal.
    const window = approachingStormWindow(60);
    const now = windowNow(window);
    expect(detectRainFault(window, now, true).rainSensorSuspect).toBe(false);
    const lenient = { ...RAIN_FAULT_DEFAULTS, SUSTAIN_MIN: 15 };
    expect(detectRainFault(window, now, true, lenient).rainSensorSuspect).toBe(true);
  });

  it("suppresses a representative approaching-storm sweep; sustained variants still fire (SC-005)", () => {
    // Leading edge: the full storm signature is present but concentrated in the
    // last < SUSTAIN_MIN minutes (now-45 sub-window below quorum) → EVERY window
    // in the population is suppressed, not just the single 07-06 capture.
    for (const stormMin of [30, 35, 40, 44]) {
      for (const gust of [10, 16, 22]) {
        const w = approachingStormWindow(stormMin, { gust });
        expect(detectRainFault(w, windowNow(w), true)).toEqual({
          rainSensorSuspect: false,
          rainSensorReason: null,
        });
      }
    }
    // Sustained counterpart: the same signature held ≥ SUSTAIN_MIN → each fires.
    for (const gust of [10, 16, 22]) {
      const w = approachingStormWindow(75, { gust });
      expect(detectRainFault(w, windowNow(w), true).rainSensorSuspect).toBe(true);
    }
  });
});

describe("detectRainFault — threshold boundaries + quorum (US1)", () => {
  const t = RAIN_FAULT_DEFAULTS;

  it("fires when exactly MIN_PROXIES (4) proxies concur, not at 3", () => {
    // Night base fires 3 dynamics proxies (humidity + gust + pressure); add temp.
    const three = threeProxyWindow();
    expect(detectRainFault(three, windowNow(three), false).rainSensorSuspect).toBe(false);
    const four = threeProxyWindow({ tempDrop: t.TEMP_DROP_F });
    expect(detectRainFault(four, windowNow(four), false).rainSensorSuspect).toBe(true);
  });

  it("temp crash fires at the threshold and not just below (as the 4th proxy)", () => {
    const at = threeProxyWindow({ tempDrop: t.TEMP_DROP_F });
    const below = threeProxyWindow({ tempDrop: t.TEMP_DROP_F - 0.1 });
    expect(detectRainFault(at, windowNow(at), false).rainSensorSuspect).toBe(true);
    expect(detectRainFault(below, windowNow(below), false).rainSensorSuspect).toBe(false);
  });

  it("humidity surge fires at the threshold and not just below", () => {
    // Temp + gust + pressure fire comfortably (3); humidity is the boundary 4th.
    const base = { tempDrop: 12, gust: 16, pressDip: 1.3, solarPeak: 0 };
    const at = buildReadings({ ...base, humSurge: t.HUMIDITY_SURGE_PCT + 0.5 });
    const below = buildReadings({ ...base, humSurge: t.HUMIDITY_SURGE_PCT - 0.5 });
    expect(detectRainFault(at, windowNow(at), false).rainSensorSuspect).toBe(true);
    expect(detectRainFault(below, windowNow(below), false).rainSensorSuspect).toBe(false);
  });

  it("gust spike fires at the window-max threshold and not just below", () => {
    const base = { tempDrop: 12, humSurge: 18, pressDip: 1.3, solarPeak: 0 };
    const at = buildReadings({ ...base, gust: t.GUST_SPIKE_MPH + 0.5 });
    const below = buildReadings({ ...base, gust: t.GUST_SPIKE_MPH - 0.5 });
    expect(detectRainFault(at, windowNow(at), false).rainSensorSuspect).toBe(true);
    expect(detectRainFault(below, windowNow(below), false).rainSensorSuspect).toBe(false);
  });

  it("pressure dip fires at the threshold and not just below", () => {
    const base = { tempDrop: 12, humSurge: 18, gust: 16, solarPeak: 0 };
    const at = buildReadings({ ...base, pressDip: t.PRESSURE_DIP_HPA + 0.1 });
    const below = buildReadings({ ...base, pressDip: t.PRESSURE_DIP_HPA - 0.1 });
    expect(detectRainFault(at, windowNow(at), false).rainSensorSuspect).toBe(true);
    expect(detectRainFault(below, windowNow(below), false).rainSensorSuspect).toBe(false);
  });

  it("solar collapse fires only by day, at the fraction threshold (4th proxy)", () => {
    // Three dynamics proxies fire (temp + humidity + gust, no pressure); solar is the 4th.
    const base = { tempDrop: t.TEMP_DROP_F, humSurge: t.HUMIDITY_SURGE_PCT, gust: t.GUST_SPIKE_MPH, pressDip: 0, solarPeak: 600 };
    const dayAt = buildReadings({ ...base, solarFrac: t.SOLAR_COLLAPSE_FRAC });
    const dayBelow = buildReadings({ ...base, solarFrac: t.SOLAR_COLLAPSE_FRAC - 0.05 });
    expect(detectRainFault(dayAt, windowNow(dayAt), true).rainSensorSuspect).toBe(true);
    expect(detectRainFault(dayBelow, windowNow(dayBelow), true).rainSensorSuspect).toBe(false);
    // Same collapse at night: the solar proxy cannot fire ⇒ only 3 proxies ⇒ false (C5).
    expect(detectRainFault(dayAt, windowNow(dayAt), false).rainSensorSuspect).toBe(false);
  });

  it("solar collapse needs a daytime peak ≥ SOLAR_DAY_MIN_WM2 to count", () => {
    const base = { tempDrop: t.TEMP_DROP_F, humSurge: t.HUMIDITY_SURGE_PCT, gust: t.GUST_SPIKE_MPH, pressDip: 0 };
    // Peak below the daytime floor: nothing meaningful to collapse ⇒ proxy can't fire.
    const dim = buildReadings({ ...base, solarPeak: t.SOLAR_DAY_MIN_WM2 - 1, solarFrac: 1 });
    expect(detectRainFault(dim, windowNow(dim), true).rainSensorSuspect).toBe(false);
  });

  it("the piezo gate holds the fault off when the rate exceeds PIEZO_RATE_EPS", () => {
    const measuring = stormWindow({ rateMax: RAIN_FAULT_DEFAULTS.PIEZO_RATE_EPS + 0.01 });
    expect(detectRainFault(measuring, windowNow(measuring), true)).toEqual({
      rainSensorSuspect: false,
      rainSensorReason: null,
    });
  });

  it("the piezo gate holds the fault off when the event accumulation rises past PIEZO_EVENT_EPS", () => {
    const measuring = stormWindow({ eventRise: RAIN_FAULT_DEFAULTS.PIEZO_EVENT_EPS + 0.02 });
    expect(detectRainFault(measuring, windowNow(measuring), true).rainSensorSuspect).toBe(false);
  });

  it("uses RAIN_FAULT_DEFAULTS when no thresholds are passed but honours overrides", () => {
    const night = nightStormWindow();
    // Raising MIN_PROXIES to 5 means the 4 dynamics proxies can never reach quorum at night.
    const strict = { ...RAIN_FAULT_DEFAULTS, MIN_PROXIES: 5 };
    expect(detectRainFault(night, windowNow(night), false, strict).rainSensorSuspect).toBe(false);
    expect(detectRainFault(night, windowNow(night), false).rainSensorSuspect).toBe(true);
  });
});

describe("detectRainFault — dew & saturation suppression (US2)", () => {
  it("does NOT flag the real 06-28 dew window — the piezo gate (0.19 in/hr) excludes it", () => {
    // Overnight radiative cooling to dewpoint: high RH, but the WS90 piezo actually
    // read ~0.19 in/hr, so the gate holds the fault off (C2/C7/SC-002).
    const result = detectRainFault(dewGate, lastNow(dewGate), false);
    expect(result).toEqual({ rainSensorSuspect: false, rainSensorReason: null });
  });

  it("does NOT flag the real 06-28 calm-saturation window — the quorum is not met (piezo 0)", () => {
    // Calm saturation: piezo dead-zero so the gate PASSES, but the dynamics proxies
    // never reach MIN_PROXIES ⇒ excluded by the quorum, not the gate (C6/FR-006).
    const result = detectRainFault(dewCalm, lastNow(dewCalm), false);
    expect(result).toEqual({ rainSensorSuspect: false, rainSensorReason: null });
  });

  it("does NOT flag bare overnight saturation (high RH, no dynamics, dead piezo)", () => {
    const calm = calmSaturationWindow();
    expect(detectRainFault(calm, windowNow(calm), false)).toEqual({
      rainSensorSuspect: false,
      rainSensorReason: null,
    });
  });

  it("does NOT flag a partial signature of only 3 proxies — a 4th is required (C3)", () => {
    // gust + pressure + solar collapse fire (3), but no temp crash and no humidity
    // surge ⇒ one short of the quorum.
    const partial = buildReadings({
      tempDrop: 0,
      humSurge: 0,
      gust: 16,
      pressDip: 1.3,
      solarPeak: 600,
      solarFrac: 0.75,
    });
    expect(detectRainFault(partial, windowNow(partial), true).rainSensorSuspect).toBe(false);
  });

  it("yields zero false positives across a representative nightly-saturation sweep (SC-004)", () => {
    // Sweep a range of calm overnight saturation windows: rising RH toward 100%,
    // tiny gusts, flat/near-flat pressure, no solar, dead piezo. NONE may flag.
    for (let humStart = 90; humStart <= 99; humStart += 1) {
      for (const gust of [0, 1, 2, 3]) {
        for (const humSurge of [0, 1, 2]) {
          const window = calmSaturationWindow({ humStart, gust, humSurge });
          const result = detectRainFault(window, windowNow(window), false);
          expect(result).toEqual({ rainSensorSuspect: false, rainSensorReason: null });
        }
      }
    }
  });
});

describe("detectRainFault — sustained real downpour still flags (US2, 014)", () => {
  it("still flags the sustained 06-28 dead-gauge downpour, with a 'sustained' reason (C8, SC-002)", () => {
    // The 06-28 signature held with rain flatlined 0.0 for hours, so the now-45
    // sub-window fires the full signature too → the sustained gate keeps the
    // true positive, and the reason notes the signature was SUSTAINED (FR-012).
    const result = detectRainFault(storm, lastNow(storm), true);
    expect(result.rainSensorSuspect).toBe(true);
    expect(result.rainSensorReason).toEqual(expect.any(String));
    expect(result.rainSensorReason!.toLowerCase()).toContain("sustained");
  });

  it("pins the SUSTAIN_MIN transition: holds at now but not now-45 → false; holds at both → true (C8/C9)", () => {
    // (a) Storm concentrated in the last 40 min: the signature holds at `now` but
    //     the now-45 sub-window is in the calm prefix → false.
    const recent = approachingStormWindow(40);
    expect(detectRainFault(recent, windowNow(recent), true).rainSensorSuspect).toBe(false);
    // (b) Same storm sustained across 75 min: signature holds at BOTH → true.
    const sustained = approachingStormWindow(75);
    expect(detectRainFault(sustained, windowNow(sustained), true).rainSensorSuspect).toBe(true);
  });

  it("does not regress any 008 negative under the sustained gate (monotonic tightening, SC-003/SC-004)", () => {
    // The gate can only turn true→false, so every 008 negative stays negative:
    // the dew gate path, the calm-saturation quorum path, and the measured-rain
    // gate path all remain { false, null }.
    expect(detectRainFault(dewGate, lastNow(dewGate), false)).toEqual({
      rainSensorSuspect: false,
      rainSensorReason: null,
    });
    expect(detectRainFault(dewCalm, lastNow(dewCalm), false)).toEqual({
      rainSensorSuspect: false,
      rainSensorReason: null,
    });
    expect(detectRainFault(rain, lastNow(rain), true)).toEqual({
      rainSensorSuspect: false,
      rainSensorReason: null,
    });
  });
});

describe("detectRainFault — structural contract (FR-012, local-only)", () => {
  it("accepts only (readings, now, isDay, thresholds?) — no NWS/precipitation argument", () => {
    // Required-arg arity is 3 (thresholds is optional with a default). There is no
    // precipitation / NWS / network parameter — the detector is local-only.
    expect(detectRainFault).toHaveLength(3);
  });
});

describe("detectRainFault — FullMetricMap boundary parsing (number | string)", () => {
  it("coerces string-valued metrics (the gateway emits strings)", () => {
    const window = stormWindow();
    const stringified = window.map((r) => ({
      observedAt: r.observedAt,
      metrics: Object.fromEntries(
        Object.entries(r.metrics).map(([k, v]) => [k, String(v)]),
      ),
    })) as StoredReading[];
    expect(detectRainFault(stringified, windowNow(window), true).rainSensorSuspect).toBe(true);
  });

  it("skips readings with missing or non-numeric metric values", () => {
    const window = stormWindow();
    // Remove temp from two readings (the scan skips both the earlier and later
    // sample) and make humidity non-numeric on another; the rest still fires.
    const damaged = window.map((r, i) => {
      const metrics = { ...r.metrics } as Record<string, number | string>;
      if (i === 0 || i === 3) delete metrics.outdoorTempF;
      if (i === 1) metrics.outdoorHumidityPct = "n/a";
      return { observedAt: r.observedAt, metrics };
    }) as StoredReading[];
    expect(detectRainFault(damaged, windowNow(window), true).rainSensorSuspect).toBe(true);
  });

  it("treats an all-missing gust series as no spike (window max of an empty series is 0)", () => {
    const window = nightStormWindow().map((r) => {
      const metrics = { ...r.metrics } as Record<string, number | string>;
      delete metrics.gustMph;
      return { observedAt: r.observedAt, metrics };
    }) as StoredReading[];
    // Gust can't fire ⇒ only 3 dynamics proxies remain ⇒ not suspect.
    expect(detectRainFault(window, windowNow(window), false).rainSensorSuspect).toBe(false);
  });

  it("drops readings with an unparseable observedAt before assessing", () => {
    const window = stormWindow();
    const withJunk = [
      { observedAt: "not-a-date", metrics: window[0]!.metrics },
      ...window,
    ];
    expect(detectRainFault(withJunk, windowNow(window), true).rainSensorSuspect).toBe(true);
  });
});
