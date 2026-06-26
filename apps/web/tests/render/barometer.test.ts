import { describe, it, expect, beforeEach } from "vitest";
import { renderBarometer, type BarometerData } from "../../src/render/barometer.ts";

function host(): HTMLElement {
  document.body.innerHTML = `<section data-panel="baro"></section>`;
  return document.querySelector<HTMLElement>("[data-panel='baro']")!;
}

function data(overrides: Partial<BarometerData> = {}): BarometerData {
  return {
    pressureHpa: 1003.5,
    baroTrend: { direction: "rising", deltaHpa: 0.4, etaMinutes: null },
    conditionIcon: "clear",
    conditionStale: false,
    conditionText: "Sunny",
    ...overrides,
  };
}

let container: HTMLElement;
beforeEach(() => {
  container = host();
});

describe("renderBarometer", () => {
  it("shows the pressure, a rising arrow with its 3h delta, and the condition icon", () => {
    renderBarometer(container, data());

    expect(container.querySelector("[data-press]")?.textContent).toBe("1003.5");

    const arrow = container.querySelector<HTMLElement>("[data-baro-trend]")!;
    expect(arrow.textContent).toBe("↗");
    expect(arrow.classList.contains("rising")).toBe(true);
    expect(container.querySelector("[data-baro-delta]")?.textContent).toBe("0.4");

    const icon = container.querySelector<HTMLElement>("[data-cond-icon]")!;
    expect(icon.getAttribute("data-cond-icon")).toBe("clear");
    expect(icon.classList.contains("stale")).toBe(false);
  });

  it("shows the verbatim NWS condition label and a colored glyph", () => {
    renderBarometer(
      container,
      data({ conditionIcon: "partly-cloudy", conditionText: "Partly Sunny" }),
    );
    expect(container.querySelector("[data-cond-label]")?.textContent).toBe("Partly Sunny");
    expect(container.querySelector(".cond-glyph")?.textContent).toBe("\u26C5");
  });

  it("derives a label from the icon when NWS text is unavailable", () => {
    renderBarometer(container, data({ conditionIcon: "cloudy", conditionText: null }));
    expect(container.querySelector("[data-cond-label]")?.textContent).toBe("Cloudy");
  });

  it("renders a falling arrow", () => {
    renderBarometer(
      container,
      data({ baroTrend: { direction: "falling", deltaHpa: -1.2, etaMinutes: null } }),
    );
    const arrow = container.querySelector<HTMLElement>("[data-baro-trend]")!;
    expect(arrow.textContent).toBe("↘");
    expect(arrow.classList.contains("falling")).toBe(true);
    expect(container.querySelector("[data-baro-delta]")?.textContent).toBe("-1.2");
  });

  it("renders a steady arrow", () => {
    renderBarometer(
      container,
      data({ baroTrend: { direction: "steady", deltaHpa: 0.1, etaMinutes: null } }),
    );
    const arrow = container.querySelector<HTMLElement>("[data-baro-trend]")!;
    expect(arrow.textContent).toBe("→");
    expect(arrow.classList.contains("steady")).toBe(true);
  });

  it("counts down to availability while history accumulates", () => {
    renderBarometer(
      container,
      data({ baroTrend: { direction: "unavailable", deltaHpa: null, etaMinutes: 120 } }),
    );
    expect(container.querySelector("[data-baro-trend]")).toBeNull();
    expect(container.querySelector("[data-baro-delta]")).toBeNull();
    expect(container.querySelector("[data-baro-unavailable]")?.textContent).toBe(
      "Trend available in 120 minutes.",
    );
  });

  it("uses the singular unit at one minute remaining", () => {
    renderBarometer(
      container,
      data({ baroTrend: { direction: "unavailable", deltaHpa: null, etaMinutes: 1 } }),
    );
    expect(container.querySelector("[data-baro-unavailable]")?.textContent).toBe(
      "Trend available in 1 minute.",
    );
  });

  it("falls back to a generic unavailable label when no ETA can be estimated", () => {
    renderBarometer(
      container,
      data({ baroTrend: { direction: "unavailable", deltaHpa: null, etaMinutes: null } }),
    );
    expect(container.querySelector("[data-baro-trend]")).toBeNull();
    expect(container.querySelector("[data-baro-delta]")).toBeNull();
    expect(container.querySelector("[data-baro-unavailable]")?.textContent).toBe(
      "trend unavailable",
    );
  });

  it("greys the condition icon when conditionStale is true", () => {
    renderBarometer(container, data({ conditionIcon: "cloudy", conditionStale: true }));
    const icon = container.querySelector<HTMLElement>("[data-cond-icon]")!;
    expect(icon.getAttribute("data-cond-icon")).toBe("cloudy");
    expect(icon.classList.contains("stale")).toBe(true);
  });

  it("falls back to a neutral icon when no condition has been fetched yet", () => {
    renderBarometer(container, data({ conditionIcon: null, conditionText: null, conditionStale: true }));
    const icon = container.querySelector<HTMLElement>("[data-cond-icon]")!;
    expect(icon.getAttribute("data-cond-icon")).toBe("");
    expect(icon.classList.contains("stale")).toBe(true);
    expect(container.querySelector(".cond-glyph")?.textContent).toBe("—");
    expect(container.querySelector("[data-cond-label]")?.textContent).toBe("—");
  });
});
