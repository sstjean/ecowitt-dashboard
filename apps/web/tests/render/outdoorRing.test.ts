import { describe, it, expect, beforeEach } from "vitest";
import { renderOutdoorRing } from "../../src/render/outdoorRing.ts";

function container(): HTMLElement {
  return document.createElement("div");
}

const sample = {
  outdoorTempF: 72.4,
  dayHighF: 81.6,
  dayLowF: 58.2,
  feelsLikeF: 70.9,
  dewpointF: 55.5,
  outdoorHumidityPct: 64,
};

describe("renderOutdoorRing", () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = container();
  });

  it("renders the current temperature centerpiece with a degree unit", () => {
    renderOutdoorRing(root, sample);
    expect(root.querySelector("[data-out-temp]")?.textContent).toBe("72");
    expect(root.querySelector(".ring-center .unit")?.textContent).toBe("°");
  });

  it("renders day high (up) and day low (down) marks", () => {
    renderOutdoorRing(root, sample);
    expect(root.querySelector("[data-out-hi]")?.textContent).toBe("82");
    expect(root.querySelector("[data-out-lo]")?.textContent).toBe("58");
    expect(root.querySelector(".hl .up")?.textContent).toContain("↑");
    expect(root.querySelector(".hl .dn")?.textContent).toContain("↓");
  });

  it("paints the ring stroke via the temperature gradient", () => {
    renderOutdoorRing(root, sample);
    const stop = root.querySelector("linearGradient stop.g0");
    expect(stop?.getAttribute("stop-color")).toMatch(/^rgb\(/);
  });

  it("replaces prior content when re-rendered (live update)", () => {
    renderOutdoorRing(root, sample);
    renderOutdoorRing(root, { ...sample, outdoorTempF: 90.1 });
    expect(root.querySelectorAll("[data-out-temp]")).toHaveLength(1);
    expect(root.querySelector("[data-out-temp]")?.textContent).toBe("90");
  });
});
