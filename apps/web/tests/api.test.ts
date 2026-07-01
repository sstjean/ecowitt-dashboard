import { describe, it, expect, vi, afterEach } from "vitest";
import type { LatestSnapshot } from "@ecowitt/shared";
import { fetchLatest } from "../src/api.ts";

const astro = {
  sunriseUtc: "2026-06-21T09:25:00Z",
  sunsetUtc: "2026-06-22T00:31:00Z",
  sunAltitudeFraction: 0.58,
  moonPhase: 0.21,
};

function okEnvelope(): LatestSnapshot {
  return {
    status: "ok",
    observedAt: "2026-06-21T18:05:00Z",
    serverTime: "2026-06-21T18:05:07Z",
    reading: {
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
    },
    astro,
    baroTrend: { direction: "rising", deltaHpa: 1.4, etaMinutes: null },
    conditionIcon: "clear",
    conditionStale: false,
    conditionText: "Sunny",
    rainSensorSuspect: false,
    rainSensorReason: null,
    sensorHealth: { available: false, stale: true, capturedAtUtc: null, sensors: [] },
  };
}

function noDataEnvelope(): LatestSnapshot {
  return {
    status: "no-data",
    observedAt: null,
    serverTime: "2026-06-21T18:05:07Z",
    reading: null,
    astro,
    baroTrend: { direction: "unavailable", deltaHpa: null, etaMinutes: null },
    conditionIcon: null,
    conditionStale: true,
    conditionText: null,
    rainSensorSuspect: false,
    rainSensorReason: null,
    sensorHealth: { available: false, stale: true, capturedAtUtc: null, sensors: [] },
  };
}

function mockFetch(body: unknown, ok = true, status = 200): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchLatest", () => {
  it("fetches and parses an ok envelope", async () => {
    mockFetch(okEnvelope());
    const snap = await fetchLatest("http://api.test");
    expect(globalThis.fetch).toHaveBeenCalledWith("http://api.test/api/v1/latest");
    expect(snap.status).toBe("ok");
    expect(snap.reading?.outdoorTempF).toBe(72);
  });

  it("fetches and parses a no-data envelope", async () => {
    mockFetch(noDataEnvelope());
    const snap = await fetchLatest("http://api.test");
    expect(snap.status).toBe("no-data");
    expect(snap.reading).toBeNull();
    expect(snap.conditionStale).toBe(true);
  });

  it("defaults to a same-origin request when no base URL is given", async () => {
    mockFetch(okEnvelope());
    await fetchLatest();
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/v1/latest");
  });

  it("throws on a non-ok HTTP response", async () => {
    mockFetch({}, false, 503);
    await expect(fetchLatest("http://api.test")).rejects.toThrow();
  });

  it("throws when the payload fails schema validation", async () => {
    mockFetch({ status: "ok" });
    await expect(fetchLatest("http://api.test")).rejects.toThrow();
  });
});
