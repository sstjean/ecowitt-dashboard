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
    observedAt: "2026-06-19T22:00:00Z",
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
    rainEventIn: 0.5,
    rainHourlyIn: 0,
    rainDailyIn: 0.5,
    rainWeeklyIn: 0,
    rainMonthlyIn: 0,
    rainYearlyIn: 0,
    rainRateInHr: 0,
    isRaining: false,
    pressureHpa: 1016.2,
  };
}

function snap(serverTime: string): LatestSnapshot {
  const r = reading();
  return {
    status: "ok",
    observedAt: r.observedAt,
    serverTime,
    reading: r,
    astro,
    baroTrend: { direction: "steady", deltaHpa: 0 },
    conditionIcon: "clear",
    conditionStale: false,
  };
}

let root: HTMLElement;
beforeEach(() => {
  root = shell();
});

describe("Stale state", () => {
  it("dims every panel and stamps STALE over the last value when the reading ages past 3× cadence", () => {
    // observedAt is five minutes (300 s) before serverTime → well past 3×30 s.
    renderSnapshot(snap("2026-06-19T22:05:00Z"), root);

    const hosts = [
      root.querySelector<HTMLElement>("[data-ring='outdoor']")!,
      root.querySelector<HTMLElement>("[data-ring='feels']")!,
      root.querySelector<HTMLElement>("[data-ring='wind']")!,
      root.querySelector<HTMLElement>("[data-panel='rain']")!,
    ];
    for (const host of hosts) {
      expect(host.classList.contains("stale")).toBe(true);
      expect(host.querySelector("[data-stale]")?.textContent).toBe("STALE");
    }

    // The last value is still shown beneath the STALE stamp, never blanked.
    expect(root.querySelector("[data-out-temp]")?.textContent).toBe("72");
    expect(root.querySelector("[data-rain-daily]")?.textContent).toBe("0.50");
  });

  it("does not mark panels stale while the reading is Fresh", () => {
    // observedAt is seven seconds before serverTime → Fresh.
    renderSnapshot(snap("2026-06-19T22:00:07Z"), root);

    expect(root.querySelector(".stale")).toBeNull();
    expect(root.querySelector("[data-stale]")).toBeNull();
    expect(root.querySelector("[data-out-temp]")?.textContent).toBe("72");
  });
});
