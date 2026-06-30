import { describe, it, expect, beforeEach } from "vitest";
import type { LatestSnapshot } from "@ecowitt/shared";
import { renderSnapshot } from "../../src/render/index.ts";
import { renderMissingState } from "../../src/render/freshness.ts";

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
  };
}

let root: HTMLElement;
beforeEach(() => {
  root = shell();
});

describe("renderMissingState", () => {
  it("renders an em-dash on a neutral gauge for every panel host, never a 0", () => {
    renderMissingState(root);

    for (const selector of ["[data-ring='outdoor']", "[data-ring='feels']"]) {
      const host = root.querySelector<HTMLElement>(selector)!;
      expect(host.childElementCount).toBeGreaterThan(0);
      expect(host.textContent).toContain("—");
      expect(host.textContent).not.toContain("0");
      // Neutral gauge: no temperature gradient applied.
      expect(host.querySelector(".ring.missing")).not.toBeNull();
      expect(host.querySelector("linearGradient")).toBeNull();
    }
  });

  it("is what the render dispatch shows for a no-data snapshot", () => {
    renderSnapshot(noDataSnap(), root);

    const outdoor = root.querySelector<HTMLElement>("[data-ring='outdoor']")!;
    expect(outdoor.textContent).toContain("—");
    expect(outdoor.querySelector(".ring.missing")).not.toBeNull();
  });
});
