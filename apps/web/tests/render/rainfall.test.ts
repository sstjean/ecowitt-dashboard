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

  it("nests 'Raining now' inside .rain-main above the Daily Rain value when raining (US1)", () => {
    // Arrange + Act: trusted gauge, actively raining.
    renderRainfall(container, rain({ isRaining: true, rainSensorSuspect: false }));

    // Assert: the banner lives in the middle column, not at card level or in the <h3>.
    const banner = container.querySelector<HTMLElement>("[data-rain-now]")!;
    const main = container.querySelector<HTMLElement>(".rain-main")!;
    expect(banner.closest("h3")).toBeNull();
    expect(banner.classList.contains("rain-now-banner")).toBe(true);
    expect(banner.getAttribute("role")).toBe("status");
    expect(main.contains(banner)).toBe(true);

    // It precedes the Daily Rain value in DOM order (its only layout effect is to
    // push Daily Rain + label down).
    const daily = container.querySelector<HTMLElement>("[data-rain-daily]")!;
    expect(
      banner.compareDocumentPosition(daily) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // The pulsing dot + label are preserved; the banner is visible and un-dimmed.
    const dot = banner.querySelector(".dot");
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(banner.querySelector(".rain-now-text")?.textContent).toBe("Raining now");
    expect(banner.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector(".rain-body")?.classList.contains("dimmed")).toBe(false);
  });

  it("hides the banner and keeps Daily Rain in place when dry (US1)", () => {
    renderRainfall(container, rain({ isRaining: false, rainSensorSuspect: false }));
    const banner = container.querySelector<HTMLElement>("[data-rain-now]")!;
    expect(banner.hasAttribute("hidden")).toBe(true);
    // Daily value stays nested in .rain-main in its normal position.
    const daily = container.querySelector<HTMLElement>("[data-rain-daily]")!;
    expect(container.querySelector(".rain-main")?.contains(daily)).toBe(true);
  });

  it("exposes the agreed full-scale cap", () => {
    expect(RAIN_FULL_SCALE_IN).toBe(4);
  });
});

describe("renderRainfall — rain-sensor fault overlay (US2)", () => {
  const REASON =
    "Storm signature with no rain measured (temperature crash, humidity surge, gust spike, pressure dip)";

  it("renders a single overlay (icon + title + reason) and dims the body when suspect (FR-009)", () => {
    renderRainfall(
      container,
      rain({ rainDailyIn: 0, rainSensorSuspect: true, rainSensorReason: REASON }),
    );
    // Exactly one overlay, and it is the NEW overlay element — the old inline
    // `.rain-fault` block is gone.
    const overlays = container.querySelectorAll(".rain-fault-overlay[data-rain-fault]");
    expect(overlays.length).toBe(1);
    expect(container.querySelector(".rain-fault")).toBeNull();

    const overlay = overlays[0] as HTMLElement;
    expect(overlay.querySelector(".rain-fault-icon")?.textContent).toBe("⚠");
    expect(overlay.querySelector(".rain-fault-title")?.textContent).toBe(
      "Sensor may not be reporting",
    );
    expect(overlay.querySelector("[data-rain-fault-reason]")?.textContent).toBe(REASON);

    // The card content behind the overlay is dimmed, and the banner is suppressed.
    expect(container.querySelector(".rain-body")?.classList.contains("dimmed")).toBe(true);
    expect(container.querySelector("[data-rain-now]")?.hasAttribute("hidden")).toBe(true);
    expect(container.querySelector("[data-rain-daily]")?.textContent).toBe("0.00");
  });

  it("keeps the overlay a11y-announced and free of any timestamp/UTC stamp (FR-011)", () => {
    renderRainfall(
      container,
      rain({ rainDailyIn: 0, rainSensorSuspect: true, rainSensorReason: REASON }),
    );
    const overlay = container.querySelector<HTMLElement>("[data-rain-fault]")!;
    expect(overlay.classList.contains("rain-fault-overlay")).toBe(true);
    expect(overlay.getAttribute("role")).toBe("status");
    // No raw UTC ISO stamp and no clock time may appear in the overlay.
    expect(overlay.textContent ?? "").not.toMatch(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/);
    expect(overlay.textContent ?? "").not.toMatch(/\b\d{1,2}:\d{2}\b/);
  });

  it("shows the normal dry state with NO overlay and no dim when not suspect (FR-010)", () => {
    renderRainfall(
      container,
      rain({ rainDailyIn: 0, isRaining: false, rainSensorSuspect: false, rainSensorReason: null }),
    );
    expect(container.querySelector("[data-rain-fault]")).toBeNull();
    expect(container.querySelector(".rain-body")?.classList.contains("dimmed")).toBe(false);
    expect(container.querySelector("[data-rain-daily]")?.textContent).toBe("0.00");
  });

  it("renders the overlay with an empty reason if suspect arrives without a reason", () => {
    // The envelope contract pairs suspect with a non-null reason, but the card
    // defends against a malformed envelope by rendering an empty reason rather
    // than crashing.
    renderRainfall(
      container,
      rain({ rainDailyIn: 0, rainSensorSuspect: true, rainSensorReason: null }),
    );
    const overlay = container.querySelector<HTMLElement>("[data-rain-fault]");
    expect(overlay).not.toBeNull();
    expect(overlay?.querySelector(".rain-fault-icon")?.textContent).toBe("⚠");
    expect(overlay?.querySelector(".rain-fault-title")?.textContent).toBe(
      "Sensor may not be reporting",
    );
    expect(container.querySelector("[data-rain-fault-reason]")?.textContent).toBe("");
  });
});

describe("renderRainfall — mutual exclusivity of the two cues (US3)", () => {
  it("suppresses the 'Raining now' banner whenever the gauge is suspect, even if isRaining (Feature 008 invariant)", () => {
    // Arrange + Act: the gauge reports rain, but it is also suspected of faulting.
    renderRainfall(
      container,
      rain({ isRaining: true, rainSensorSuspect: true, rainSensorReason: "stuck gauge" }),
    );
    // Assert: the fault overlay wins and the banner is hidden.
    expect(container.querySelector(".rain-fault-overlay[data-rain-fault]")).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>("[data-rain-now]")!.hasAttribute("hidden"),
    ).toBe(true);
  });

  it("never shows a visible banner and an overlay together for any suspect input", () => {
    for (const isRaining of [true, false]) {
      renderRainfall(
        container,
        rain({ isRaining, rainSensorSuspect: true, rainSensorReason: "x" }),
      );
      const overlay = container.querySelector("[data-rain-fault]");
      const bannerVisible = !container
        .querySelector<HTMLElement>("[data-rain-now]")!
        .hasAttribute("hidden");
      expect(overlay !== null && bannerVisible).toBe(false);
    }
  });
});
