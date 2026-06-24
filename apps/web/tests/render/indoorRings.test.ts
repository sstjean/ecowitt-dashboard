import { describe, it, expect, beforeEach } from "vitest";
import {
  renderIndoorRings,
  type IndoorRingsData,
} from "../../src/render/indoorRings.ts";
import { RING_CIRCUMFERENCE } from "../../src/render/ring.ts";
import { tempGradientStops } from "../../src/render/tempScale.ts";

function host(): HTMLElement {
  document.body.innerHTML = `<section data-panel="indoor"></section>`;
  return document.querySelector<HTMLElement>("[data-panel='indoor']")!;
}

function data(overrides: Partial<IndoorRingsData> = {}): IndoorRingsData {
  return { indoorTempF: 70.2, indoorHumidityPct: 48, ...overrides };
}

let container: HTMLElement;
beforeEach(() => {
  container = host();
});

describe("renderIndoorRings", () => {
  it("shows the indoor temperature on a shared-scale gradient ring", () => {
    renderIndoorRings(container, data());

    expect(container.querySelector("[data-in-temp]")?.textContent).toBe("70");

    const stop = container.querySelector<SVGStopElement>("#inTempGrad .g1");
    expect(stop?.getAttribute("stop-color")).toBe(tempGradientStops(70.2).dark);
  });

  it("shows the indoor humidity on a violet ring filled to the humidity fraction", () => {
    renderIndoorRings(container, data({ indoorHumidityPct: 48 }));

    expect(container.querySelector("[data-in-hum]")?.textContent).toBe("48");

    const ring = container.querySelector<SVGCircleElement>("[data-in-hum-ring]")!;
    expect(ring.getAttribute("stroke")).toBe("#7c6cf0");
    const offset = Number(ring.getAttribute("stroke-dashoffset"));
    expect(offset).toBeCloseTo(RING_CIRCUMFERENCE * 0.52, 3);
  });

  it("labels each ring", () => {
    renderIndoorRings(container, data());
    const labels = [...container.querySelectorAll(".glabel")].map((n) => n.textContent);
    expect(labels).toContain("Indoor Temperature");
    expect(labels).toContain("Indoor Humidity");
  });
});
