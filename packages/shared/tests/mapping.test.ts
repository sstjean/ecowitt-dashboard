import { describe, it, expect } from "vitest";
import {
  normalizeToFullMetricMap,
  projectLiveReading,
  cToF,
  msToMph,
  mmToIn,
  inHgToHpa,
} from "../src/mapping.ts";

const OBSERVED_AT = "2026-06-21T18:05:00Z";

function devicePayload(overrides: {
  common_list?: Array<{ id: string; val: string; unit?: string }>;
  wh25?: Array<Record<string, string>>;
  piezoRain?: Array<{ id: string; val: string; unit?: string }>;
  rain?: Array<{ id: string; val: string }>;
  extra?: Record<string, unknown>;
} = {}) {
  return {
    common_list: overrides.common_list ?? [
      { id: "0x02", val: "72.0" },
      { id: "0x07", val: "48" },
      { id: "3", val: "71.0" },
      { id: "0x03", val: "55.0" },
      { id: "0x0B", val: "8.0" },
      { id: "0x0C", val: "14.0" },
      { id: "0x19", val: "22.0" },
      { id: "0x0A", val: "45" },
      { id: "0x15", val: "540.0" },
      { id: "0x17", val: "5" },
      { id: "0x6D", val: "120" },
      { id: "5", val: "1.2" },
    ],
    wh25: overrides.wh25 ?? [
      { intemp: "70.0", inhumi: "48%", abs: "29.92 inHg", rel: "29.92 inHg" },
    ],
    piezoRain: overrides.piezoRain ?? [
      { id: "srain_piezo", val: "0" },
      { id: "0x0D", val: "0.00" },
      { id: "0x0E", val: "0.00" },
      { id: "0x7C", val: "0.00" },
      { id: "0x10", val: "0.00" },
      { id: "0x11", val: "0.12" },
      { id: "0x12", val: "1.85" },
      { id: "0x13", val: "22.40" },
    ],
    rain: overrides.rain ?? [{ id: "0x10", val: "0.00" }],
    ...overrides.extra,
  };
}

describe("unit conversion helpers", () => {
  it("cToF converts Celsius to Fahrenheit", () => {
    expect(cToF(0)).toBeCloseTo(32, 5);
    expect(cToF(100)).toBeCloseTo(212, 5);
  });
  it("msToMph converts metres/sec to mph", () => {
    expect(msToMph(1)).toBeCloseTo(2.2369362, 5);
  });
  it("mmToIn converts millimetres to inches", () => {
    expect(mmToIn(25.4)).toBeCloseTo(1, 5);
  });
  it("inHgToHpa converts inches-mercury to hectopascals", () => {
    expect(inHgToHpa(29.92)).toBeCloseTo(1013.2, 1);
  });
});

describe("normalizeToFullMetricMap", () => {
  it("captures every field full-fidelity, preserving unknown extras", () => {
    const map = normalizeToFullMetricMap(
      devicePayload({
        common_list: [
          { id: "0x02", val: "72.0" },
          { id: "0x07", val: "48" },
          { id: "3", val: "71.0" },
          { id: "0x03", val: "55.0" },
          { id: "0x0B", val: "8.0" },
          { id: "0x0C", val: "14.0" },
          { id: "0x19", val: "22.0" },
          { id: "0x0A", val: "45" },
          { id: "0x15", val: "540.0" },
          { id: "0x17", val: "5" },
          { id: "0x6D", val: "120" },
          { id: "0x99", val: "weird-sensor" },
        ],
      }),
    );
    expect(map.outdoorTempF).toBe(72);
    expect(map.indoorTempF).toBe(70);
    expect(map.pressureHpa).toBeCloseTo(1013.2, 1);
    // unknown id preserved as-is, never dropped
    expect(map["common_0x99"]).toBe("weird-sensor");
  });

  it("converts non-display units to the fixed display units", () => {
    const map = normalizeToFullMetricMap(
      devicePayload({
        common_list: [
          { id: "0x02", val: "22.2", unit: "C" },
          { id: "0x07", val: "48" },
          { id: "3", val: "21.6", unit: "C" },
          { id: "0x03", val: "12.8", unit: "C" },
          { id: "0x0B", val: "3.0", unit: "m/s" },
          { id: "0x0C", val: "6.0", unit: "m/s" },
          { id: "0x19", val: "9.8", unit: "m/s" },
          { id: "0x0A", val: "45" },
          { id: "0x15", val: "540.0" },
          { id: "0x17", val: "5" },
          { id: "0x6D", val: "120" },
        ],
        piezoRain: [
          { id: "srain_piezo", val: "1" },
          { id: "0x0D", val: "0.0", unit: "mm" },
          { id: "0x0E", val: "1.0", unit: "mm" },
          { id: "0x7C", val: "0.0", unit: "mm" },
          { id: "0x10", val: "25.4", unit: "mm" },
          { id: "0x11", val: "0.0", unit: "mm" },
          { id: "0x12", val: "0.0", unit: "mm" },
          { id: "0x13", val: "0.0", unit: "mm" },
        ],
      }),
    );
    expect(map.outdoorTempF).toBeCloseTo(72, 1);
    expect(map.windMph).toBeCloseTo(6.71, 1);
    expect(map.rainDailyIn).toBeCloseTo(1, 3);
  });

  it("throws on a payload that fails the gateway shape", () => {
    expect(() => normalizeToFullMetricMap({ junk: true })).toThrow();
  });

  it("throws when a known numeric field is non-numeric", () => {
    expect(() =>
      normalizeToFullMetricMap(
        devicePayload({
          common_list: [
            { id: "0x02", val: "not-a-number" },
            { id: "0x07", val: "48" },
            { id: "3", val: "71.0" },
            { id: "0x03", val: "55.0" },
            { id: "0x0B", val: "8.0" },
            { id: "0x0C", val: "14.0" },
            { id: "0x19", val: "22.0" },
            { id: "0x0A", val: "45" },
            { id: "0x15", val: "540.0" },
            { id: "0x17", val: "5" },
            { id: "0x6D", val: "120" },
          ],
        }),
      ),
    ).toThrow();
  });

  it("preserves unknown wh25 keys and converts an indoor temp reported in Celsius", () => {
    const map = normalizeToFullMetricMap(
      devicePayload({
        wh25: [
          {
            intemp: "21.1",
            inhumi: "48%",
            abs: "29.92 inHg",
            rel: "29.92 inHg",
            unit: "C",
            intemp_batt: "1",
          },
        ],
      }),
    );
    expect(map.indoorTempF).toBeCloseTo(70, 1);
    expect(map.wh25_intemp_batt).toBe("1");
    expect(map.wh25_unit).toBe("C");
  });

  it("preserves an unrecognised piezoRain id verbatim", () => {
    const map = normalizeToFullMetricMap(
      devicePayload({
        piezoRain: [
          { id: "srain_piezo", val: "0" },
          { id: "0x0D", val: "0.00" },
          { id: "0x0E", val: "0.00" },
          { id: "0x7C", val: "0.00" },
          { id: "0x10", val: "0.00" },
          { id: "0x11", val: "0.00" },
          { id: "0x12", val: "0.00" },
          { id: "0x13", val: "0.00" },
          { id: "0xFF", val: "mystery" },
        ],
      }),
    );
    expect(map.piezoRain_0xFF).toBe("mystery");
  });

  it("preserves legacy tipping-bucket rain values verbatim", () => {
    const map = normalizeToFullMetricMap(devicePayload());
    expect(map["rain_0x10"]).toBe("0.00");
  });

  it("works when the optional legacy rain category is absent", () => {
    const payload = devicePayload();
    delete (payload as Record<string, unknown>).rain;
    const map = normalizeToFullMetricMap(payload);
    expect(map["rain_0x10"]).toBeUndefined();
    expect(map.rainDailyIn).toBe(0);
  });
});

describe("projectLiveReading", () => {
  it("projects the 23 instantaneous snapshot fields (no derived aggregates)", () => {
    const map = normalizeToFullMetricMap(devicePayload());
    const reading = projectLiveReading(map, OBSERVED_AT);
    expect(reading).toEqual({
      observedAt: OBSERVED_AT,
      outdoorTempF: 72,
      feelsLikeF: 71,
      dewpointF: 55,
      outdoorHumidityPct: 48,
      windMph: 8,
      windDirDeg: 45,
      gustMph: 14,
      windAvg10mDirDeg: 120,
      maxDailyGustMph: 22,
      solarWm2: 540,
      uvIndex: 5,
      indoorTempF: 70,
      indoorHumidityPct: 48,
      rainEventIn: 0,
      rainHourlyIn: 0,
      rainDailyIn: 0,
      rainWeeklyIn: 0.12,
      rainMonthlyIn: 1.85,
      rainYearlyIn: 22.4,
      rainRateInHr: 0,
      isRaining: false,
      pressureHpa: inHgToHpa(29.92),
    });
    // derived aggregates are NOT set by the mapper
    expect("dayHighF" in reading).toBe(false);
    expect("windAvg10mMph" in reading).toBe(false);
    expect("maxDailyGustDir" in reading).toBe(false);
  });

  it("sources all rain totals from piezoRain, never the legacy tipping bucket", () => {
    const map = normalizeToFullMetricMap(
      devicePayload({
        piezoRain: [
          { id: "srain_piezo", val: "1" },
          { id: "0x0D", val: "0.30" },
          { id: "0x0E", val: "0.54" },
          { id: "0x7C", val: "0.20" },
          { id: "0x10", val: "0.67" },
          { id: "0x11", val: "0.80" },
          { id: "0x12", val: "2.00" },
          { id: "0x13", val: "30.00" },
        ],
        rain: [{ id: "0x10", val: "0.00" }],
      }),
    );
    const reading = projectLiveReading(map, OBSERVED_AT);
    expect(reading.rainDailyIn).toBe(0.67);
    expect(reading.isRaining).toBe(true);
  });

  it("treats a non-zero srain_piezo flag as raining", () => {
    const map = normalizeToFullMetricMap(
      devicePayload({
        piezoRain: [
          { id: "srain_piezo", val: "1" },
          { id: "0x0D", val: "0.00" },
          { id: "0x0E", val: "0.04" },
          { id: "0x7C", val: "0.00" },
          { id: "0x10", val: "0.00" },
          { id: "0x11", val: "0.00" },
          { id: "0x12", val: "0.00" },
          { id: "0x13", val: "0.00" },
        ],
      }),
    );
    expect(projectLiveReading(map, OBSERVED_AT).isRaining).toBe(true);
  });

  it("rejects when a required field is missing", () => {
    const map = normalizeToFullMetricMap(devicePayload());
    delete (map as Record<string, unknown>).outdoorTempF;
    expect(() => projectLiveReading(map, OBSERVED_AT)).toThrow();
  });

  it("rejects when a value is out of physical bounds", () => {
    const map = normalizeToFullMetricMap(devicePayload());
    (map as Record<string, unknown>).outdoorHumidityPct = 250;
    expect(() => projectLiveReading(map, OBSERVED_AT)).toThrow();
  });
});
