import { describe, it, expect, beforeEach } from "vitest";
import type { LatestSnapshot, LiveReadingSnapshot } from "@ecowitt/shared";
import { renderSnapshot } from "../../src/render/index.ts";

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

const astro = {
  sunriseUtc: "2026-06-21T09:25:00Z",
  sunsetUtc: "2026-06-22T00:31:00Z",
  sunAltitudeFraction: 0.58,
  moonPhase: 0.21,
};

function reading(): LiveReadingSnapshot {
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
  };
}

function noDataSnap(): LatestSnapshot {
  return {
    status: "no-data",
    observedAt: null,
    serverTime: "2026-01-15T22:05:07Z",
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

function okSnap(): LatestSnapshot {
  const r = reading();
  return {
    status: "ok",
    observedAt: r.observedAt,
    serverTime: "2026-06-19T22:05:07Z",
    reading: r,
    astro,
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

describe("Missing → Fresh transition", () => {
  it("replaces the em-dash Missing panels with live values on the first real snapshot", () => {
    renderSnapshot(noDataSnap(), root);
    expect(root.querySelector("[data-ring='outdoor']")?.textContent).toContain("—");
    expect(root.querySelector("[data-out-temp]")).toBeNull();

    renderSnapshot(okSnap(), root);

    expect(root.querySelector("[data-out-temp]")?.textContent).toBe("72");
    expect(root.querySelector("[data-feels]")?.textContent).toBe("71");
    expect(root.querySelector("[data-ring='outdoor'] .ring.missing")).toBeNull();
  });
});
