import { describe, it, expect, beforeEach } from "vitest";
import {
  renderRainfall,
  dropFillFraction,
  rainDropColor,
  RAIN_FULL_SCALE_IN,
} from "../../src/render/rainfall.ts";

function host(): HTMLElement {
  document.body.innerHTML = `<section data-panel="rain"></section>`;
  return document.querySelector<HTMLElement>("[data-panel='rain']")!;
}

interface RainData {
  rainDailyIn: number;
  rainRateInHr: number;
  rainEventIn: number;
  rainHourlyIn: number;
  rainWeeklyIn: number;
  rainMonthlyIn: number;
  rainYearlyIn: number;
  isRaining: boolean;
  rainSensorSuspect: boolean;
  rainSensorReason: string | null;
}

function rain(overrides: Partial<RainData> = {}): RainData {
  return {
    rainDailyIn: 0.5,
    rainRateInHr: 0.04,
    rainEventIn: 0.5,
    rainHourlyIn: 0.1,
    rainWeeklyIn: 1.2,
    rainMonthlyIn: 3.4,
    rainYearlyIn: 28.6,
    isRaining: true,
    rainSensorSuspect: false,
    rainSensorReason: null,
    ...overrides,
  };
}

let container: HTMLElement;
beforeEach(() => {
  container = host();
});

describe("dropFillFraction", () => {
  it("is proportional to the daily total against the full-scale cap", () => {
    expect(dropFillFraction(0, 4)).toBe(0);
    expect(dropFillFraction(2, 4)).toBe(0.5);
    expect(dropFillFraction(4, 4)).toBe(1);
  });

  it("clamps to 1 above the cap", () => {
    expect(dropFillFraction(8, 4)).toBe(1);
  });
});

describe("rainDropColor", () => {
  it("is base blue at or below the cap", () => {
    expect(rainDropColor(0, 4)).toBe("#4da6ff");
    expect(rainDropColor(4, 4)).toBe("#4da6ff");
  });

  it("escalates blue → amber → red beyond the cap", () => {
    // 50% over the cap → amber endpoint.
    expect(rainDropColor(6, 4)).toBe("rgb(255, 152, 0)");
    // 100%+ over the cap → red endpoint (clamped).
    expect(rainDropColor(8, 4)).toBe("rgb(211, 47, 47)");
    expect(rainDropColor(20, 4)).toBe("rgb(211, 47, 47)");
    // Between blue and amber.
    const quarter = rainDropColor(5, 4);
    expect(quarter).not.toBe("#4da6ff");
    expect(quarter).toMatch(/^rgb\(/);
  });
});

describe("renderRainfall", () => {
  it("renders the daily total, rate, and all six totals in inches", () => {
    renderRainfall(container, rain());

    expect(container.querySelector("[data-rain-daily]")?.textContent).toBe("0.50");
    expect(container.querySelector("[data-rain-rate]")?.textContent).toBe("0.04");
    expect(container.querySelector("[data-rain-event]")?.textContent).toBe("0.50 in");
    expect(container.querySelector("[data-rain-hourly]")?.textContent).toBe("0.10 in");
    expect(container.querySelector("[data-rain-weekly]")?.textContent).toBe("1.20 in");
    expect(container.querySelector("[data-rain-monthly]")?.textContent).toBe("3.40 in");
    expect(container.querySelector("[data-rain-yearly]")?.textContent).toBe("28.60 in");
  });

  it("fills the droplet proportionally and colours it from the daily total", () => {
    renderRainfall(container, rain({ rainDailyIn: 2 }));
    const fill = container.querySelector<SVGRectElement>("[data-drop-fill]")!;
    // frac 0.5 over a 8..120 span → height 56, y 64.
    expect(fill.getAttribute("height")).toBe("56");
    expect(fill.getAttribute("y")).toBe("64");
    expect(fill.getAttribute("fill")).toBe("#4da6ff");
  });

  it("keeps the droplet full but escalates colour above the cap, true total still shown", () => {
    renderRainfall(container, rain({ rainDailyIn: 8 }));
    const fill = container.querySelector<SVGRectElement>("[data-drop-fill]")!;
    expect(fill.getAttribute("height")).toBe("112");
    expect(fill.getAttribute("fill")).toBe("rgb(211, 47, 47)");
    expect(container.querySelector("[data-rain-daily]")?.textContent).toBe("8.00");
  });

  it("shows the raining-now indicator only when the piezo flag is set", () => {
    renderRainfall(container, rain({ isRaining: true }));
    expect(container.querySelector("[data-rain-now]")?.hasAttribute("hidden")).toBe(false);

    renderRainfall(container, rain({ isRaining: false }));
    expect(container.querySelector("[data-rain-now]")?.hasAttribute("hidden")).toBe(true);
  });

  it("exposes the agreed full-scale cap", () => {
    expect(RAIN_FULL_SCALE_IN).toBe(4);
  });
});

describe("renderRainfall — rain-sensor fault indicator (US3)", () => {
  const REASON =
    "Storm signature with no rain measured (temperature crash, humidity surge, gust spike, pressure dip)";

  it("shows a distinct fault indicator + reason when rainSensorSuspect is true (FR-009)", () => {
    renderRainfall(
      container,
      rain({ rainDailyIn: 0, rainSensorSuspect: true, rainSensorReason: REASON }),
    );
    const fault = container.querySelector("[data-rain-fault]");
    expect(fault).not.toBeNull();
    // The suspect reason is surfaced verbatim.
    expect(container.querySelector("[data-rain-fault-reason]")?.textContent).toBe(REASON);
    // It is distinct from a normal dry presentation — the "raining now" badge is
    // suppressed (the gauge can't be trusted) and the daily total still shows 0.00.
    expect(container.querySelector("[data-rain-now]")?.hasAttribute("hidden")).toBe(true);
    expect(container.querySelector("[data-rain-daily]")?.textContent).toBe("0.00");
  });

  it("shows the normal dry state with NO fault indicator when not suspect (FR-010)", () => {
    renderRainfall(
      container,
      rain({ rainDailyIn: 0, isRaining: false, rainSensorSuspect: false, rainSensorReason: null }),
    );
    expect(container.querySelector("[data-rain-fault]")).toBeNull();
    expect(container.querySelector("[data-rain-daily]")?.textContent).toBe("0.00");
  });

  it("is kiosk-legible and a11y-announced, and renders no naive UTC timestamp (FR-011)", () => {
    renderRainfall(
      container,
      rain({ rainDailyIn: 0, rainSensorSuspect: true, rainSensorReason: REASON }),
    );
    const fault = container.querySelector<HTMLElement>("[data-rain-fault]")!;
    // Feature 004 legibility: a dedicated, status-announced warning element.
    expect(fault.classList.contains("rain-fault")).toBe(true);
    expect(fault.getAttribute("role")).toBe("status");
    // TZ rule: the indicator must never dump a raw UTC ISO timestamp (a 'Z' stamp).
    expect(fault.textContent ?? "").not.toMatch(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/);
  });

  it("renders the indicator with an empty reason if suspect arrives without a reason", () => {
    // The envelope contract pairs suspect with a non-null reason, but the card
    // defends against a malformed envelope by rendering an empty reason rather
    // than crashing.
    renderRainfall(
      container,
      rain({ rainDailyIn: 0, rainSensorSuspect: true, rainSensorReason: null }),
    );
    expect(container.querySelector("[data-rain-fault]")).not.toBeNull();
    expect(container.querySelector("[data-rain-fault-reason]")?.textContent).toBe("");
  });
});
