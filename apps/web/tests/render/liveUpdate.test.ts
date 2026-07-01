import { describe, it, expect, beforeEach } from "vitest";
import type { LatestSnapshot, LiveReadingSnapshot } from "@ecowitt/shared";
import { renderSnapshot, mountDashboard } from "../../src/render/index.ts";

function shell(): HTMLElement {
  document.body.innerHTML = `
    <div id="app">
      <main>
        <div class="gauge" data-ring="outdoor"></div>
        <div data-ring="feels"></div>
        <div data-ring="wind"></div>
        <section data-panel="rain"></section>
        <section data-panel="solar"></section>
        <section data-panel="indoor"></section>
        <section data-panel="baro"></section>
      </main>
    </div>`;
  return document.getElementById("app")!;
}

function reading(overrides: Partial<LiveReadingSnapshot> = {}): LiveReadingSnapshot {
  return {
    observedAt: "2026-06-19T22:05:00Z",
    outdoorTempF: 72.4,
    feelsLikeF: 70.9,
    dewpointF: 55.5,
    outdoorHumidityPct: 64,
    dayHighF: 81.6,
    dayLowF: 58.2,
    windMph: 4.1,
    windDirDeg: 210,
    gustMph: 9.2,
    windAvg10mMph: 3.6,
    windAvg10mDirDeg: 205,
    maxDailyGustMph: 18.4,
    maxDailyGustDir: "SW",
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

function snap(r: LiveReadingSnapshot): LatestSnapshot {
  return {
    status: "ok",
    observedAt: r.observedAt,
    serverTime: "2026-06-19T22:05:07Z",
    reading: r,
    astro: {
      sunriseUtc: "2026-06-21T09:25:00Z",
      sunsetUtc: "2026-06-22T00:31:00Z",
      sunAltitudeFraction: 0.58,
      moonPhase: 0.21,
    },
    baroTrend: { direction: "steady", deltaHpa: 0, etaMinutes: null },
    conditionIcon: "clear",
    conditionStale: false,
    conditionText: "Sunny",
    rainSensorSuspect: false,
    rainSensorReason: null,
    sensorHealth: { available: false, stale: true, capturedAtUtc: null, sensors: [] },
  };
}

let root: HTMLElement;
beforeEach(() => {
  root = shell();
});

describe("live update", () => {
  it("re-renders the outdoor ring and Feels Like ring when a newer snapshot arrives, without interaction", () => {
    const dashboard = mountDashboard(root);

    dashboard.update(snap(reading({ outdoorTempF: 60, feelsLikeF: 59 })));
    expect(root.querySelector("[data-out-temp]")?.textContent).toBe("60");
    expect(root.querySelector("[data-feels]")?.textContent).toBe("59");

    dashboard.update(snap(reading({ outdoorTempF: 91, feelsLikeF: 96 })));
    expect(root.querySelectorAll("[data-out-temp]")).toHaveLength(1);
    expect(root.querySelector("[data-out-temp]")?.textContent).toBe("91");
    expect(root.querySelector("[data-feels]")?.textContent).toBe("96");

    dashboard.stop();
  });

  it("also re-renders via the bare renderSnapshot entrypoint", () => {
    renderSnapshot(snap(reading({ outdoorTempF: 45 })), root);
    expect(root.querySelector("[data-out-temp]")?.textContent).toBe("45");
  });
});
