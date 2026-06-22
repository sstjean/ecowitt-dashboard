import { describe, it, expect, beforeEach } from "vitest";
import type { LatestSnapshot } from "@ecowitt/shared";
import { renderSnapshot } from "../../src/render/index.ts";

function shell(): HTMLElement {
  document.body.innerHTML = `
    <div id="app">
      <header><span data-header-date></span><span data-header-time></span></header>
    </div>`;
  return document.getElementById("app")!;
}

const astro = {
  sunriseUtc: "2026-06-21T09:25:00Z",
  sunsetUtc: "2026-06-22T00:31:00Z",
  sunAltitudeFraction: 0.58,
  moonPhase: 0.21,
};

function okSnap(): LatestSnapshot {
  return {
    status: "ok",
    observedAt: "2026-06-19T22:05:00Z",
    serverTime: "2026-06-19T22:05:07Z",
    reading: null,
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
  it("renders the Eastern header date + time from observedAt", () => {
    renderSnapshot(okSnap(), root);
    expect(root.querySelector("[data-header-date]")!.textContent).toBe(
      "Friday, June 19th, 2026",
    );
    expect(root.querySelector("[data-header-time]")!.textContent).toBe("6:05 PM");
  });

  it("falls back to serverTime when there is no observed reading", () => {
    renderSnapshot(noDataSnap(), root);
    expect(root.querySelector("[data-header-date]")!.textContent).toBe(
      "Thursday, January 15th, 2026",
    );
    expect(root.querySelector("[data-header-time]")!.textContent).toBe("5:05 PM");
  });
});
