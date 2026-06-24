import { describe, it, expect, beforeEach } from "vitest";
import { renderWindCompass, cardinal } from "../../src/render/windCompass.ts";

function host(): HTMLElement {
  document.body.innerHTML = `<div data-ring="wind"></div>`;
  return document.querySelector<HTMLElement>("[data-ring='wind']")!;
}

interface WindData {
  windMph: number;
  windDirDeg: number;
  gustMph: number;
  windAvg10mMph: number;
  windAvg10mDirDeg: number;
  maxDailyGustMph: number;
  maxDailyGustDir: string;
}

function wind(overrides: Partial<WindData> = {}): WindData {
  return {
    windMph: 8,
    windDirDeg: 45,
    gustMph: 14,
    windAvg10mMph: 6,
    windAvg10mDirDeg: 90,
    maxDailyGustMph: 22,
    maxDailyGustDir: "W",
    ...overrides,
  };
}

let container: HTMLElement;
beforeEach(() => {
  container = host();
});

describe("cardinal", () => {
  it("maps degrees to 16-point compass labels (wrapping at 360)", () => {
    expect(cardinal(0)).toBe("N");
    expect(cardinal(45)).toBe("NE");
    expect(cardinal(90)).toBe("E");
    expect(cardinal(180)).toBe("S");
    expect(cardinal(270)).toBe("W");
    expect(cardinal(360)).toBe("N");
    expect(cardinal(202.5)).toBe("SSW");
  });
});

describe("renderWindCompass", () => {
  it("renders speed, cardinal + bearing, and gust", () => {
    renderWindCompass(container, wind());

    expect(container.querySelector("[data-wind-speed]")?.textContent).toBe("8.0");
    expect(container.querySelector("[data-wind-dir]")?.textContent).toBe("NE");
    expect(container.querySelector("[data-wind-deg]")?.textContent).toBe("45");
    expect(container.querySelector("[data-wind-gust]")?.textContent).toBe("14.0");
  });

  it("rotates the rim marker to the bearing the wind comes from", () => {
    renderWindCompass(container, wind({ windDirDeg: 45 }));
    expect(container.querySelector("[data-wind-needle]")?.getAttribute("transform")).toBe(
      "rotate(45 100 100)",
    );
  });

  it("places the marker at N for a due-north wind (0°)", () => {
    renderWindCompass(container, wind({ windDirDeg: 0 }));
    expect(container.querySelector("[data-wind-needle]")?.getAttribute("transform")).toBe(
      "rotate(0 100 100)",
    );
  });

  it("renders calm with no misleading direction at 0 mph", () => {
    renderWindCompass(container, wind({ windMph: 0 }));

    expect(container.querySelector("[data-wind-speed]")?.textContent).toBe("Calm");
    expect(container.querySelector("[data-wind-dir]")).toBeNull();
    expect(container.querySelector("[data-wind-deg]")).toBeNull();
    expect(container.querySelector("[data-wind-needle]")).toBeNull();
  });
});
