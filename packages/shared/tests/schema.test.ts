import { describe, it, expect } from "vitest";
import {
  liveReadingSnapshotSchema,
  fullMetricMapSchema,
  gatewayResponseSchema,
  latestSnapshotSchema,
  healthSchema,
  astronomicalDataSchema,
  barometricTrendSchema,
  sensorHealthEntrySchema,
  sensorHealthSchema,
  SENSOR_HEALTH_DEFAULTS,
} from "../src/schema.ts";
import type { RainFaultState, SensorHealthEntry, SensorHealth } from "../src/schema.ts";

function validSnapshot() {
  return {
    observedAt: "2026-06-21T18:05:00Z",
    outdoorTempF: 72,
    feelsLikeF: 71,
    dewpointF: 55,
    outdoorHumidityPct: 48,
    dayHighF: 81,
    dayLowF: 58,
    windMph: 8,
    windDirDeg: 45,
    gustMph: 14,
    windAvg10mMph: 6,
    windAvg10mDirDeg: 120,
    maxDailyGustMph: 22,
    maxDailyGustDir: "W",
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
    pressureHpa: 1013,
  };
}

describe("liveReadingSnapshotSchema", () => {
  it("accepts a fully-formed 27-field snapshot", () => {
    expect(liveReadingSnapshotSchema.parse(validSnapshot())).toEqual(validSnapshot());
  });

  it("rejects an unknown extra field (additionalProperties:false)", () => {
    expect(() =>
      liveReadingSnapshotSchema.parse({ ...validSnapshot(), bogus: 1 }),
    ).toThrow();
  });

  it.each([
    ["outdoorHumidityPct", 101],
    ["outdoorHumidityPct", -1],
    ["indoorHumidityPct", 150],
    ["windDirDeg", 361],
    ["windDirDeg", -5],
    ["windAvg10mDirDeg", 400],
    ["windMph", -1],
    ["gustMph", -2],
    ["windAvg10mMph", -1],
    ["maxDailyGustMph", -1],
    ["solarWm2", -1],
    ["uvIndex", -1],
    ["rainDailyIn", -0.1],
    ["rainRateInHr", -0.1],
    ["pressureHpa", -1],
  ])("rejects out-of-bounds %s = %s", (field, value) => {
    expect(() =>
      liveReadingSnapshotSchema.parse({ ...validSnapshot(), [field]: value }),
    ).toThrow();
  });

  it("rejects a non-boolean isRaining", () => {
    expect(() =>
      liveReadingSnapshotSchema.parse({ ...validSnapshot(), isRaining: "yes" }),
    ).toThrow();
  });

  it("rejects a missing required field", () => {
    const s = validSnapshot() as Record<string, unknown>;
    delete s.pressureHpa;
    expect(() => liveReadingSnapshotSchema.parse(s)).toThrow();
  });

  it("rejects a non-ISO observedAt", () => {
    expect(() =>
      liveReadingSnapshotSchema.parse({ ...validSnapshot(), observedAt: "not-a-date" }),
    ).toThrow();
  });

  it("accepts boundary values (humidity 0/100, dir 0/360)", () => {
    const s = {
      ...validSnapshot(),
      outdoorHumidityPct: 0,
      indoorHumidityPct: 100,
      windDirDeg: 0,
      windAvg10mDirDeg: 360,
    };
    expect(liveReadingSnapshotSchema.parse(s)).toEqual(s);
  });
});

describe("fullMetricMapSchema", () => {
  it("accepts a flat map of numbers and strings", () => {
    const map = { outdoorTempF: 72, debug_heap: "1234", battOutdoor: 1 };
    expect(fullMetricMapSchema.parse(map)).toEqual(map);
  });

  it("rejects a nested object value", () => {
    expect(() => fullMetricMapSchema.parse({ a: { nested: 1 } })).toThrow();
  });
});

describe("gatewayResponseSchema", () => {
  it("accepts the device category-array shape and preserves extras", () => {
    const raw = {
      common_list: [{ id: "0x02", val: "72.0" }],
      wh25: [{ intemp: "70.0", inhumi: "48%", abs: "29.92 inHg", rel: "29.92 inHg" }],
      piezoRain: [{ id: "0x10", val: "0.00" }],
      debug: [{ id: "heap", val: "1000" }],
    };
    expect(gatewayResponseSchema.parse(raw)).toMatchObject({
      common_list: [{ id: "0x02", val: "72.0" }],
    });
  });

  it("rejects a payload with no common_list", () => {
    expect(() => gatewayResponseSchema.parse({ wh25: [] })).toThrow();
  });
});

describe("latestSnapshotSchema", () => {
  it("accepts an ok envelope", () => {
    const env = {
      status: "ok",
      observedAt: "2026-06-21T18:05:00Z",
      serverTime: "2026-06-21T18:05:07Z",
      reading: validSnapshot(),
      astro: {
        sunriseUtc: "2026-06-21T09:25:00Z",
        sunsetUtc: "2026-06-22T00:31:00Z",
        sunAltitudeFraction: 0.58,
        moonPhase: 0.21,
      },
      baroTrend: { direction: "rising", deltaHpa: 1.4, etaMinutes: null },
      conditionIcon: "clear",
      conditionStale: false,
      conditionText: "Sunny",
      rainSensorSuspect: false,
      rainSensorReason: null,
      sensorHealth: { available: false, stale: true, capturedAtUtc: null, sensors: [] },
    };
    expect(latestSnapshotSchema.parse(env)).toEqual(env);
  });

  it("accepts a no-data envelope with null reading and null icon", () => {
    const env = {
      status: "no-data",
      observedAt: null,
      serverTime: "2026-06-21T18:05:07Z",
      reading: null,
      astro: {
        sunriseUtc: "2026-06-21T09:25:00Z",
        sunsetUtc: "2026-06-22T00:31:00Z",
        sunAltitudeFraction: 0.58,
        moonPhase: 0.21,
      },
      baroTrend: { direction: "unavailable", deltaHpa: null, etaMinutes: null },
      conditionIcon: null,
      conditionStale: true,
      conditionText: null,
      rainSensorSuspect: false,
      rainSensorReason: null,
      sensorHealth: { available: false, stale: true, capturedAtUtc: null, sensors: [] },
    };
    expect(latestSnapshotSchema.parse(env)).toEqual(env);
  });

  it("rejects an invalid status", () => {
    expect(() =>
      latestSnapshotSchema.parse({ status: "weird" }),
    ).toThrow();
  });
});

describe("latestSnapshotSchema rain-fault fields", () => {
  function baseEnvelope() {
    return {
      status: "ok" as const,
      observedAt: "2026-06-21T18:05:00Z",
      serverTime: "2026-06-21T18:05:07Z",
      reading: validSnapshot(),
      astro: {
        sunriseUtc: "2026-06-21T09:25:00Z",
        sunsetUtc: "2026-06-22T00:31:00Z",
        sunAltitudeFraction: 0.58,
        moonPhase: 0.21,
      },
      baroTrend: { direction: "rising" as const, deltaHpa: 1.4, etaMinutes: null },
      conditionIcon: "clear" as const,
      conditionStale: false,
      conditionText: "Sunny",
      sensorHealth: { available: false, stale: true, capturedAtUtc: null, sensors: [] },
    };
  }

  it("accepts a suspect envelope with a reason string", () => {
    const env = {
      ...baseEnvelope(),
      rainSensorSuspect: true,
      rainSensorReason: "temp crash, humidity surge, gust spike, pressure dip",
    };
    expect(latestSnapshotSchema.parse(env)).toEqual(env);
  });

  it("accepts a not-suspect envelope with a null reason", () => {
    const env = { ...baseEnvelope(), rainSensorSuspect: false, rainSensorReason: null };
    expect(latestSnapshotSchema.parse(env)).toEqual(env);
  });

  it("rejects an envelope missing rainSensorSuspect", () => {
    const env = { ...baseEnvelope(), rainSensorReason: null };
    expect(() => latestSnapshotSchema.parse(env)).toThrow();
  });

  it("rejects an envelope missing rainSensorReason", () => {
    const env = { ...baseEnvelope(), rainSensorSuspect: false };
    expect(() => latestSnapshotSchema.parse(env)).toThrow();
  });

  it("exports a RainFaultState shaped { rainSensorSuspect, rainSensorReason }", () => {
    const state: RainFaultState = { rainSensorSuspect: true, rainSensorReason: "x" };
    const cleared: RainFaultState = { rainSensorSuspect: false, rainSensorReason: null };
    expect(state.rainSensorSuspect).toBe(true);
    expect(cleared.rainSensorReason).toBeNull();
  });
});

describe("sensorHealthEntrySchema", () => {
  function validEntry() {
    return {
      id: "12FAD",
      img: "wh90",
      type: 48,
      name: "WS90",
      battery: "OK" as const,
      batteryRaw: 5,
      signalBars: 4,
      rssiDbm: -74,
      registered: true,
      lastSeenUtc: "2026-06-30T14:05:00Z",
    };
  }

  it("validates the documented per-sensor health projection", () => {
    expect(sensorHealthEntrySchema.parse(validEntry())).toEqual(validEntry());
  });

  it("accepts null battery/signal/rssi (wired sensor projection)", () => {
    const wired = {
      ...validEntry(),
      battery: "N/A" as const,
      batteryRaw: null,
      signalBars: null,
      rssiDbm: null,
    };
    expect(sensorHealthEntrySchema.parse(wired)).toEqual(wired);
  });

  it.each(["OK", "Low", "Unknown", "N/A"])("accepts battery enum %s", (battery) => {
    expect(sensorHealthEntrySchema.parse({ ...validEntry(), battery }).battery).toBe(battery);
  });

  it("rejects an out-of-enum battery value", () => {
    expect(() =>
      sensorHealthEntrySchema.parse({ ...validEntry(), battery: "Dead" }),
    ).toThrow();
  });

  it.each([5, -1, 4.5])("rejects out-of-range signalBars = %s", (signalBars) => {
    expect(() =>
      sensorHealthEntrySchema.parse({ ...validEntry(), signalBars }),
    ).toThrow();
  });

  it.each(["id", "img", "name"])("rejects an empty %s", (field) => {
    expect(() =>
      sensorHealthEntrySchema.parse({ ...validEntry(), [field]: "" }),
    ).toThrow();
  });

  it("rejects a non-integer type", () => {
    expect(() =>
      sensorHealthEntrySchema.parse({ ...validEntry(), type: 4.2 }),
    ).toThrow();
  });

  it.each(["id", "battery", "registered", "lastSeenUtc"])(
    "rejects a missing %s (strictObject)",
    (field) => {
      const partial = { ...validEntry() } as Record<string, unknown>;
      delete partial[field];
      expect(() => sensorHealthEntrySchema.parse(partial)).toThrow();
    },
  );

  it("rejects an unknown extra field (strictObject)", () => {
    expect(() =>
      sensorHealthEntrySchema.parse({ ...validEntry(), bogus: 1 }),
    ).toThrow();
  });
});

describe("sensorHealthSchema", () => {
  it("validates a well-formed sensorHealth envelope object", () => {
    const health = {
      available: true,
      stale: false,
      capturedAtUtc: "2026-06-30T14:05:00Z",
      sensors: [] as SensorHealthEntry[],
    };
    expect(sensorHealthSchema.parse(health)).toEqual(health);
  });

  it("accepts a null capturedAtUtc (unavailable)", () => {
    const health = { available: false, stale: true, capturedAtUtc: null, sensors: [] };
    expect(sensorHealthSchema.parse(health)).toEqual(health);
  });

  it("rejects a non-boolean available", () => {
    expect(() =>
      sensorHealthSchema.parse({
        available: "yes",
        stale: true,
        capturedAtUtc: null,
        sensors: [],
      }),
    ).toThrow();
  });
});

describe("SENSOR_HEALTH_DEFAULTS", () => {
  it("exposes the tunable battery-Low and staleness constants", () => {
    expect(SENSOR_HEALTH_DEFAULTS.WS90_BATTERY_LOW_MAX).toBe(1);
    expect(SENSOR_HEALTH_DEFAULTS.SENSOR_HEALTH_STALE_SECONDS).toBe(300);
  });

  it("exports SensorHealthEntry / SensorHealth types inferred from the schemas", () => {
    const entry: SensorHealthEntry = {
      id: "A0",
      img: "wh31",
      type: 7,
      name: "CH2",
      battery: "OK",
      batteryRaw: 0,
      signalBars: 4,
      rssiDbm: -96,
      registered: true,
      lastSeenUtc: "2026-06-30T14:05:00Z",
    };
    const health: SensorHealth = {
      available: true,
      stale: false,
      capturedAtUtc: "2026-06-30T14:05:00Z",
      sensors: [entry],
    };
    expect(health.sensors[0].id).toBe("A0");
  });
});

describe("latestSnapshotSchema sensorHealth field", () => {
  const emptyHealth = {
    available: false,
    stale: true,
    capturedAtUtc: null,
    sensors: [],
  };

  function baseEnvelope() {
    return {
      status: "ok" as const,
      observedAt: "2026-06-30T14:05:00Z",
      serverTime: "2026-06-30T14:05:07Z",
      reading: validSnapshot(),
      astro: {
        sunriseUtc: "2026-06-30T09:25:00Z",
        sunsetUtc: "2026-07-01T00:31:00Z",
        sunAltitudeFraction: 0.58,
        moonPhase: 0.21,
      },
      baroTrend: { direction: "rising" as const, deltaHpa: 1.4, etaMinutes: null },
      conditionIcon: "clear" as const,
      conditionStale: false,
      conditionText: "Sunny",
      rainSensorSuspect: false,
      rainSensorReason: null,
    };
  }

  it("accepts a well-formed envelope carrying sensorHealth", () => {
    const env = { ...baseEnvelope(), sensorHealth: emptyHealth };
    expect(latestSnapshotSchema.parse(env)).toEqual(env);
  });

  it("accepts a populated sensorHealth set", () => {
    const env = {
      ...baseEnvelope(),
      sensorHealth: {
        available: true,
        stale: false,
        capturedAtUtc: "2026-06-30T14:05:00Z",
        sensors: [
          {
            id: "12FAD",
            img: "wh90",
            type: 48,
            name: "WS90",
            battery: "OK" as const,
            batteryRaw: 5,
            signalBars: 4,
            rssiDbm: -74,
            registered: true,
            lastSeenUtc: "2026-06-30T14:05:00Z",
          },
        ],
      },
    };
    expect(latestSnapshotSchema.parse(env)).toEqual(env);
  });

  it("rejects an envelope missing sensorHealth (required field)", () => {
    expect(() => latestSnapshotSchema.parse(baseEnvelope())).toThrow();
  });
});

describe("astronomicalDataSchema", () => {
  it("bounds sunAltitudeFraction to 0..1", () => {
    const base = {
      sunriseUtc: "2026-06-21T09:25:00Z",
      sunsetUtc: "2026-06-22T00:31:00Z",
      sunAltitudeFraction: 1.2,
      moonPhase: 0.2,
    };
    expect(() => astronomicalDataSchema.parse(base)).toThrow();
  });
});

describe("barometricTrendSchema", () => {
  it("allows a null delta for unavailable", () => {
    expect(
      barometricTrendSchema.parse({ direction: "unavailable", deltaHpa: null, etaMinutes: 90 }),
    ).toEqual({ direction: "unavailable", deltaHpa: null, etaMinutes: 90 });
  });

  it("rejects an unknown direction", () => {
    expect(() =>
      barometricTrendSchema.parse({ direction: "sideways", deltaHpa: 0, etaMinutes: null }),
    ).toThrow();
  });

  it("rejects a negative or fractional etaMinutes", () => {
    expect(() =>
      barometricTrendSchema.parse({ direction: "unavailable", deltaHpa: null, etaMinutes: -3 }),
    ).toThrow();
    expect(() =>
      barometricTrendSchema.parse({ direction: "unavailable", deltaHpa: null, etaMinutes: 1.5 }),
    ).toThrow();
  });
});

describe("healthSchema", () => {
  it("accepts a healthy probe", () => {
    const h = { status: "ok", storeReachable: true, serverTime: "2026-06-21T18:05:07Z" };
    expect(healthSchema.parse(h)).toEqual(h);
  });
});
