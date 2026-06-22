import { describe, it, expect } from "vitest";
import type { LiveReadingSnapshot } from "@ecowitt/shared";
import type { StoredReading } from "../src/store.ts";
import { deriveDaily, degToCardinal, localDayStartIso } from "../src/enrich.ts";

type MappedReading = Omit<
  LiveReadingSnapshot,
  "dayHighF" | "dayLowF" | "windAvg10mMph" | "maxDailyGustDir"
>;

function reading(overrides: Partial<MappedReading> = {}): MappedReading {
  return {
    observedAt: "2026-06-21T15:30:00Z",
    outdoorTempF: 72,
    feelsLikeF: 70.9,
    dewpointF: 55.5,
    outdoorHumidityPct: 64,
    windMph: 4.1,
    windDirDeg: 210,
    gustMph: 9.2,
    windAvg10mDirDeg: 205,
    maxDailyGustMph: 18.4,
    solarWm2: 612,
    uvIndex: 5,
    indoorTempF: 70.2,
    indoorHumidityPct: 48,
    rainEventIn: 0,
    rainHourlyIn: 0,
    rainDailyIn: 0,
    rainWeeklyIn: 0,
    rainMonthlyIn: 0,
    rainYearlyIn: 0,
    rainRateInHr: 0,
    isRaining: false,
    pressureHpa: 1016.2,
    ...overrides,
  };
}

function stored(
  observedAt: string,
  outdoorTempF: number,
  windMph: number,
  gustMph: number,
  windDirDeg: number,
): StoredReading {
  return {
    observedAt,
    metrics: { outdoorTempF, windMph, gustMph, windDirDeg },
  };
}

describe("degToCardinal", () => {
  it("maps degrees to 16-point compass cardinals", () => {
    expect(degToCardinal(0)).toBe("N");
    expect(degToCardinal(90)).toBe("E");
    expect(degToCardinal(180)).toBe("S");
    expect(degToCardinal(225)).toBe("SW");
    expect(degToCardinal(360)).toBe("N");
  });
});

describe("localDayStartIso", () => {
  it("returns the UTC instant of midnight America/New_York (EDT)", () => {
    // 2026-06-21 is EDT (UTC-4), so local midnight = 04:00 UTC
    expect(localDayStartIso(new Date("2026-06-21T15:30:00Z"), "America/New_York")).toBe(
      "2026-06-21T04:00:00.000Z",
    );
  });

  it("handles standard time (EST, UTC-5)", () => {
    // 2026-01-15 is EST (UTC-5), so local midnight = 05:00 UTC
    expect(localDayStartIso(new Date("2026-01-15T15:30:00Z"), "America/New_York")).toBe(
      "2026-01-15T05:00:00.000Z",
    );
  });
});

describe("deriveDaily", () => {
  const now = new Date("2026-06-21T15:30:00Z");

  it("computes high/low, rolling 10-min wind average, and max-gust direction from history", () => {
    const history = [
      stored("2026-06-21T15:00:00Z", 60, 5, 12, 90), // >10 min ago
      stored("2026-06-21T15:22:00Z", 80, 7, 25, 225), // largest gust, within 10 min
      stored("2026-06-21T15:28:00Z", 70, 9, 15, 180), // within 10 min
    ];

    const daily = deriveDaily(reading(), history, now);

    expect(daily.dayHighF).toBe(80);
    expect(daily.dayLowF).toBe(60);
    expect(daily.windAvg10mMph).toBe(8); // mean of 7 and 9
    expect(daily.maxDailyGustDir).toBe("SW"); // dir at gust 25
  });

  it("falls back to the current reading on a cold start (no history), never a fabricated zero", () => {
    const daily = deriveDaily(
      reading({ outdoorTempF: 72, windMph: 4.1, windDirDeg: 210 }),
      [],
      now,
    );

    expect(daily.dayHighF).toBe(72);
    expect(daily.dayLowF).toBe(72);
    expect(daily.windAvg10mMph).toBe(4.1);
    expect(daily.maxDailyGustDir).toBe("SSW"); // cardinal of 210
  });
});
