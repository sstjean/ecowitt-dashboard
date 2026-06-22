import { describe, it, expect, beforeEach } from "vitest";
import {
  renderSolarSky,
  moonPhaseName,
  moonLitPath,
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
    sunriseUtc: "2026-06-21T09:25:00Z", // 5:25 AM EDT  → 325 min
    sunsetUtc: "2026-06-22T00:31:00Z", // 8:31 PM EDT  → 1231 min
    moonPhase: 0.21,
    ...overrides,
  };
}

// Daylight span is 325→1231 min (906 min). Eastern is UTC-4 in June.
const MIDDAY = new Date("2026-06-22T16:58:00Z"); // 12:58 PM EDT → f = 0.5 (apex)
const PRE_DAWN = new Date("2026-06-22T08:00:00Z"); // 4:00 AM EDT → before sunrise
const HOUR_BEFORE_SUNSET = new Date("2026-06-22T23:31:00Z"); // 7:31 PM EDT
const AFTER_SUNSET = new Date("2026-06-23T01:00:00Z"); // 9:00 PM EDT → after sunset

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

describe("moonLitPath", () => {
  it("draws a zero-area limb for the new moon (fully dark disk)", () => {
    expect(moonLitPath(32, 22, 0)).toBe("M32,10 A22,22 0 0 1 32,54 A22.00,22 0 0 0 32,10 Z");
  });

  it("draws a flat terminator at the quarters (half lit)", () => {
    // First quarter: right limb lit, straight terminator (rx → 0).
    expect(moonLitPath(32, 22, 0.25)).toBe("M32,10 A22,22 0 0 1 32,54 A0.00,22 0 0 0 32,10 Z");
    // Last quarter: left limb lit, straight terminator.
    expect(moonLitPath(32, 22, 0.75)).toBe("M32,10 A22,22 0 0 0 32,54 A0.00,22 0 0 0 32,10 Z");
  });

  it("draws the full disk at full moon", () => {
    expect(moonLitPath(32, 22, 0.5)).toBe("M32,10 A22,22 0 0 0 32,54 A22.00,22 0 0 0 32,10 Z");
  });

  it("bulges the terminator by waxing/waning gibbous vs crescent", () => {
    // Waxing crescent: right limb, terminator hugs right (sweep 0).
    expect(moonLitPath(32, 22, 0.1)).toMatch(/^M32,10 A22,22 0 0 1 32,54 A[\d.]+,22 0 0 0 32,10 Z$/);
    // Waxing gibbous: right limb, terminator bulges left (sweep 1).
    expect(moonLitPath(32, 22, 0.4)).toBe("M32,10 A22,22 0 0 1 32,54 A17.80,22 0 0 1 32,10 Z");
    // Waning gibbous: left limb, terminator bulges right (sweep 0).
    expect(moonLitPath(32, 22, 0.6)).toBe("M32,10 A22,22 0 0 0 32,54 A17.80,22 0 0 0 32,10 Z");
    // Waning crescent: left limb, terminator hugs left (sweep 1).
    expect(moonLitPath(32, 22, 0.9)).toBe("M32,10 A22,22 0 0 0 32,54 A17.80,22 0 0 1 32,10 Z");
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

  it("draws the moon graphic for the current phase", () => {
    renderSolarSky(container, data({ moonPhase: 0.25 }));
    expect(container.querySelector("[data-moon-lit]")?.getAttribute("d")).toBe(
      moonLitPath(32, 22, 0.25),
    );
  });

  it("walks the sun to the apex (centre, top) at solar noon and lights it", () => {
    renderSolarSky(container, data(), MIDDAY);
    const marker = container.querySelector<SVGCircleElement>("[data-sun-marker]")!;
    expect(marker.getAttribute("cx")).toBe("200.0");
    expect(marker.getAttribute("cy")).toBe("14.0");
    expect(marker.getAttribute("fill")).toBe("#ffd54a");
  });

  it("rests the sun on the baseline-left and dims it before sunrise", () => {
    renderSolarSky(container, data(), PRE_DAWN);
    const marker = container.querySelector<SVGCircleElement>("[data-sun-marker]")!;
    expect(marker.getAttribute("cx")).toBe("20.0");
    expect(marker.getAttribute("cy")).toBe("100.0");
    expect(marker.getAttribute("fill")).toBe("var(--cp-text-muted)");
    expect(marker.getAttribute("opacity")).toBe("0.35");
  });

  it("places the sun low on the right an hour before sunset — not centred", () => {
    renderSolarSky(container, data(), HOUR_BEFORE_SUNSET);
    const marker = container.querySelector<SVGCircleElement>("[data-sun-marker]")!;
    const cx = Number(marker.getAttribute("cx"));
    const cy = Number(marker.getAttribute("cy"));
    expect(cx).toBeGreaterThan(360); // far right, near sunset
    expect(cx).toBeLessThan(380);
    expect(cy).toBeGreaterThan(60); // low in the sky
    expect(marker.getAttribute("fill")).toBe("#ffd54a");
  });

  it("clamps the sun to the baseline-right and dims it after sunset", () => {
    renderSolarSky(container, data(), AFTER_SUNSET);
    const marker = container.querySelector<SVGCircleElement>("[data-sun-marker]")!;
    expect(marker.getAttribute("cx")).toBe("380.0");
    expect(marker.getAttribute("cy")).toBe("100.0");
    expect(marker.getAttribute("opacity")).toBe("0.35");
  });
});
