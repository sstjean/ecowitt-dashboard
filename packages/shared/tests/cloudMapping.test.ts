import { describe, it, expect } from "vitest";
import { cloudRealtimeToGateway } from "../src/cloudMapping.ts";
import { cloudRealtimeSchema, type GatewayItem } from "../src/schema.ts";
import { normalizeToFullMetricMap, projectLiveReading } from "../src/mapping.ts";

/** A metric as Ecowitt emits it: string-valued { time?, unit?, value }. */
function metric(value: string, unit = ""): { unit: string; value: string } {
  return { unit, value };
}

/**
 * A representative cloud `real_time` `data` object (the inner payload the
 * fetcher hands the adapter). Includes a tipping-bucket `rainfall` group that
 * MUST be ignored (D6) and an unmapped group that MUST be tolerated.
 */
function cloudData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outdoor: {
      temperature: metric("72.3", "℉"),
      feels_like: metric("70.9", "℉"),
      dew_point: metric("55.5", "℉"),
      humidity: metric("58", "%"),
    },
    indoor: {
      temperature: metric("70.1", "℉"),
      humidity: metric("47", "%"),
    },
    solar_and_uvi: {
      solar: metric("612.0", "W/m²"),
      uvi: metric("5"),
    },
    wind: {
      wind_speed: metric("4.1", "mph"),
      wind_gust: metric("9.2", "mph"),
      wind_direction: metric("212", "º"),
    },
    pressure: {
      relative: metric("30.01", "inHg"),
      absolute: metric("29.74", "inHg"),
    },
    rainfall_piezo: {
      rain_rate: metric("0.00", "in/hr"),
      event: metric("0.10", "in"),
      "1_hour": metric("0.20", "in"),
      daily: metric("0.30", "in"),
      weekly: metric("0.40", "in"),
      monthly: metric("1.50", "in"),
      yearly: metric("12.34", "in"),
    },
    // Tipping-bucket group — MUST be ignored by the adapter (FR-010, D6).
    rainfall: {
      rain_rate: metric("9.99", "in/hr"),
      daily: metric("9.99", "in"),
    },
    // Unmapped group — MUST be tolerated (loose) and ignored.
    co2: { co2: metric("420", "ppm") },
    ...overrides,
  };
}

function commonById(items: GatewayItem[], id: string): GatewayItem {
  const found = items.find((i) => i.id === id);
  if (!found) throw new Error(`missing common_list id ${id}`);
  return found;
}

describe("cloudRealtimeSchema", () => {
  it("accepts a valid data object", () => {
    expect(() => cloudRealtimeSchema.parse(cloudData())).not.toThrow();
  });

  it("rejects a partial payload (missing a required group)", () => {
    const partial = cloudData();
    delete partial.wind;
    expect(() => cloudRealtimeSchema.parse(partial)).toThrow();
  });

  it("rejects a malformed metric (missing value)", () => {
    const bad = cloudData({
      outdoor: {
        temperature: { unit: "℉" }, // no `value`
        feels_like: metric("70.9", "℉"),
        dew_point: metric("55.5", "℉"),
        humidity: metric("58", "%"),
      },
    });
    expect(() => cloudRealtimeSchema.parse(bad)).toThrow();
  });
});

describe("cloudRealtimeToGateway", () => {
  it("maps every cloud field to the correct gateway target", () => {
    const gw = cloudRealtimeToGateway(cloudData());

    expect(commonById(gw.common_list, "0x02").val).toBe("72.3"); // outdoorTempF
    expect(commonById(gw.common_list, "0x07").val).toBe("58"); // outdoorHumidityPct
    expect(commonById(gw.common_list, "3").val).toBe("70.9"); // feelsLikeF
    expect(commonById(gw.common_list, "0x03").val).toBe("55.5"); // dewpointF
    expect(commonById(gw.common_list, "0x0B").val).toBe("4.1"); // windMph
    expect(commonById(gw.common_list, "0x0C").val).toBe("9.2"); // gustMph
    expect(commonById(gw.common_list, "0x0A").val).toBe("212"); // windDirDeg
    expect(commonById(gw.common_list, "0x15").val).toBe("612.0"); // solarWm2
    expect(commonById(gw.common_list, "0x17").val).toBe("5"); // uvIndex

    const wh25 = gw.wh25[0]!;
    expect(wh25.intemp).toBe("70.1");
    expect(wh25.inhumi).toBe("47");
    expect(wh25.abs).toBe("29.74");
    expect(wh25.rel).toBe("30.01");
  });

  it("synthesizes maxDailyGustMph (0x19) ← wind_gust and windAvg10mDirDeg (0x6D) ← wind_direction (Decision A)", () => {
    const gw = cloudRealtimeToGateway(cloudData());
    expect(commonById(gw.common_list, "0x19").val).toBe("9.2");
    expect(commonById(gw.common_list, "0x6D").val).toBe("212");
  });

  it("maps weekly/monthly/yearly rain from rainfall_piezo (D7)", () => {
    const gw = cloudRealtimeToGateway(cloudData());
    const piezo = (id: string) => gw.piezoRain.find((i) => i.id === id)?.val;
    expect(piezo("0x0D")).toBe("0.10"); // event
    expect(piezo("0x0E")).toBe("0.00"); // rain_rate
    expect(piezo("0x7C")).toBe("0.20"); // hourly
    expect(piezo("0x10")).toBe("0.30"); // daily
    expect(piezo("0x11")).toBe("0.40"); // weekly
    expect(piezo("0x12")).toBe("1.50"); // monthly
    expect(piezo("0x13")).toBe("12.34"); // yearly
  });

  it("emits pressure in inHg so the mapper's inHgToHpa yields the right hPa (FR-005/FR-013)", () => {
    const map = normalizeToFullMetricMap(cloudRealtimeToGateway(cloudData()));
    expect(map.pressureHpa).toBeCloseTo(29.74 * 33.8639, 4);
    expect(map.relPressureHpa).toBeCloseTo(30.01 * 33.8639, 4);
  });

  it("sets srain_piezo to 0 when rain_rate is 0 (isRaining false)", () => {
    const gw = cloudRealtimeToGateway(cloudData());
    expect(gw.piezoRain.find((i) => i.id === "srain_piezo")?.val).toBe("0");
    const reading = projectLiveReading(
      normalizeToFullMetricMap(gw),
      "2026-06-24T12:00:00Z",
    );
    expect(reading.isRaining).toBe(false);
  });

  it("sets srain_piezo to 1 when rain_rate is positive (isRaining true)", () => {
    const gw = cloudRealtimeToGateway(
      cloudData({
        rainfall_piezo: {
          rain_rate: metric("0.50", "in/hr"),
          event: metric("0.10", "in"),
          "1_hour": metric("0.20", "in"),
          daily: metric("0.30", "in"),
          weekly: metric("0.40", "in"),
          monthly: metric("1.50", "in"),
          yearly: metric("12.34", "in"),
        },
      }),
    );
    expect(gw.piezoRain.find((i) => i.id === "srain_piezo")?.val).toBe("1");
    const reading = projectLiveReading(
      normalizeToFullMetricMap(gw),
      "2026-06-24T12:00:00Z",
    );
    expect(reading.isRaining).toBe(true);
  });

  it("ignores the tipping-bucket rainfall group (FR-010, D6)", () => {
    const map = normalizeToFullMetricMap(cloudRealtimeToGateway(cloudData()));
    // Piezo daily is 0.30; the tipping group's 9.99 must never leak through.
    expect(map.rainDailyIn).toBe(0.3);
    expect(map.rainRateInHr).toBe(0);
  });

  it("produces output that passes normalizeToFullMetricMap + projectLiveReading with no schema errors (FR-014)", () => {
    const reading = projectLiveReading(
      normalizeToFullMetricMap(cloudRealtimeToGateway(cloudData())),
      "2026-06-24T12:00:00Z",
    );
    expect(reading).toMatchObject({
      outdoorTempF: 72.3,
      feelsLikeF: 70.9,
      dewpointF: 55.5,
      outdoorHumidityPct: 58,
      windMph: 4.1,
      windDirDeg: 212,
      gustMph: 9.2,
      windAvg10mDirDeg: 212,
      maxDailyGustMph: 9.2,
      solarWm2: 612,
      uvIndex: 5,
      indoorTempF: 70.1,
      indoorHumidityPct: 47,
      rainEventIn: 0.1,
      rainHourlyIn: 0.2,
      rainDailyIn: 0.3,
      rainWeeklyIn: 0.4,
      rainMonthlyIn: 1.5,
      rainYearlyIn: 12.34,
      rainRateInHr: 0,
      isRaining: false,
    });
  });
});
