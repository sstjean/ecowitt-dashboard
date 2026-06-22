import { describe, it, expect, beforeEach } from "vitest";
import {
  renderSolarSky,
  moonPhaseName,
  type SolarSkyData,
} from "../../src/render/solarSky.ts";

function host(): HTMLElement {
  document.body.innerHTML = `<section data-panel="solar"></section>`;
  return document.querySelector<HTMLElement>("[data-panel='solar']")!;
}

function data(overrides: Partial<SolarSkyData> = {}): SolarSkyData {
  return {
    solarWm2: 612,
    uvIndex: 5,
    sunriseUtc: "2026-06-21T09:25:00Z", // 5:25 AM EDT
    sunsetUtc: "2026-06-22T00:31:00Z", // 8:31 PM EDT
    sunAltitudeFraction: 0.58,
    moonPhase: 0.21,
    ...overrides,
  };
}

let container: HTMLElement;
beforeEach(() => {
  container = host();
});

describe("moonPhaseName", () => {
  it("names each phase bucket across the 0–1 cycle", () => {
    expect(moonPhaseName(0)).toBe("New Moon");
    expect(moonPhaseName(0.96)).toBe("New Moon");
    expect(moonPhaseName(0.12)).toBe("Waxing Crescent");
    expect(moonPhaseName(0.25)).toBe("First Quarter");
    expect(moonPhaseName(0.37)).toBe("Waxing Gibbous");
    expect(moonPhaseName(0.5)).toBe("Full Moon");
    expect(moonPhaseName(0.62)).toBe("Waning Gibbous");
    expect(moonPhaseName(0.75)).toBe("Last Quarter");
    expect(moonPhaseName(0.87)).toBe("Waning Crescent");
  });
});

describe("renderSolarSky", () => {
  it("shows the solar/UV readouts and the Eastern sunrise/sunset times", () => {
    renderSolarSky(container, data());

    expect(container.querySelector("[data-solar]")?.textContent).toBe("612");
    expect(container.querySelector("[data-uv]")?.textContent).toBe("5");
    expect(container.querySelector("[data-sunrise]")?.textContent).toBe("5:25 AM");
    expect(container.querySelector("[data-sunset]")?.textContent).toBe("8:31 PM");
  });

  it("names the current moon phase", () => {
    renderSolarSky(container, data({ moonPhase: 0.5 }));
    expect(container.querySelector("[data-moon-phase]")?.textContent).toBe("Full Moon");
  });

  it("puts the sun marker at the apex at midday and lights it for day", () => {
    renderSolarSky(container, data({ sunAltitudeFraction: 1 }));
    const marker = container.querySelector<SVGCircleElement>("[data-sun-marker]")!;
    expect(marker.getAttribute("cy")).toBe("14");
    expect(marker.getAttribute("fill")).toBe("#ffd54a");
  });

  it("rests the sun marker on the baseline and dims it before sunrise / after sunset", () => {
    renderSolarSky(container, data({ sunAltitudeFraction: 0 }));
    const marker = container.querySelector<SVGCircleElement>("[data-sun-marker]")!;
    expect(marker.getAttribute("cy")).toBe("100");
    expect(marker.getAttribute("opacity")).toBe("0.35");
  });
});
