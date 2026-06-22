import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { LatestSnapshot, LiveReadingSnapshot } from "@ecowitt/shared";
import { renderSnapshot, mountDashboard } from "../../src/render/index.ts";

function shell(): HTMLElement {
  document.body.innerHTML = `
    <div id="app">
      <main>
        <div class="gauge" data-ring="outdoor"></div>
        <div data-ring="feels"></div>
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

function okSnap(r: LiveReadingSnapshot = reading()): LatestSnapshot {
  return {
    status: "ok",
    observedAt: r.observedAt,
    serverTime: "2026-06-19T22:05:07Z",
    reading: r,
    astro,
    baroTrend: { direction: "steady", deltaHpa: 0 },
    conditionIcon: "clear",
    conditionStale: false,
  };
}

function noDataSnap(): LatestSnapshot {
  return {
    status: "no-data",
    observedAt: null,
    serverTime: "2026-01-15T22:05:07Z",
    reading: null,
    astro,
    baroTrend: { direction: "unavailable", deltaHpa: null },
    conditionIcon: null,
    conditionStale: true,
  };
}

let root: HTMLElement;
beforeEach(() => {
  root = shell();
});

describe("renderSnapshot", () => {
  it("renders the outdoor + feels-like rings from the reading", () => {
    renderSnapshot(okSnap(), root);
    expect(root.querySelector("[data-out-temp]")?.textContent).toBe("72");
    expect(root.querySelector("[data-feels]")?.textContent).toBe("71");
  });

  it("clears the temperature hosts when there is no reading", () => {
    renderSnapshot(okSnap(), root);
    renderSnapshot(noDataSnap(), root);
    expect(root.querySelector("[data-ring='outdoor']")?.childElementCount).toBe(0);
    expect(root.querySelector("[data-ring='feels']")?.childElementCount).toBe(0);
  });
});

describe("mountDashboard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mounts a ticking header and updates panels", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T18:05:09Z"));
    const dashboard = mountDashboard(root);
    expect(root.querySelector(".header .h-time")?.textContent).toBe("2:05:09 PM");

    vi.advanceTimersByTime(1000);
    expect(root.querySelector(".header .h-time")?.textContent).toBe("2:05:10 PM");

    dashboard.update(okSnap());
    expect(root.querySelector("[data-out-temp]")?.textContent).toBe("72");

    dashboard.stop();
    vi.advanceTimersByTime(1000);
    expect(root.querySelector(".header .h-time")?.textContent).toBe("2:05:10 PM");
  });
});
