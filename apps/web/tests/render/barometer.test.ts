import { describe, it, expect, beforeEach } from "vitest";
import { renderBarometer, type BarometerData } from "../../src/render/barometer.ts";

function host(): HTMLElement {
  document.body.innerHTML = `<section data-panel="baro"></section>`;
  return document.querySelector<HTMLElement>("[data-panel='baro']")!;
}

function data(overrides: Partial<BarometerData> = {}): BarometerData {
  return {
    pressureHpa: 1003.5,
    baroTrend: { direction: "rising", deltaHpa: 0.4 },
    conditionIcon: "clear",
    conditionStale: false,
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

  it("renders a falling arrow", () => {
    renderBarometer(container, data({ baroTrend: { direction: "falling", deltaHpa: -1.2 } }));
    const arrow = container.querySelector<HTMLElement>("[data-baro-trend]")!;
    expect(arrow.textContent).toBe("↘");
    expect(arrow.classList.contains("falling")).toBe(true);
    expect(container.querySelector("[data-baro-delta]")?.textContent).toBe("-1.2");
  });

  it("renders a steady arrow", () => {
    renderBarometer(container, data({ baroTrend: { direction: "steady", deltaHpa: 0.1 } }));
    const arrow = container.querySelector<HTMLElement>("[data-baro-trend]")!;
    expect(arrow.textContent).toBe("→");
    expect(arrow.classList.contains("steady")).toBe(true);
  });

  it("shows a trend-unavailable state with no arrow or delta", () => {
    renderBarometer(
      container,
      data({ baroTrend: { direction: "unavailable", deltaHpa: null } }),
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
    renderBarometer(container, data({ conditionIcon: null, conditionStale: true }));
    const icon = container.querySelector<HTMLElement>("[data-cond-icon]")!;
    expect(icon.getAttribute("data-cond-icon")).toBe("");
    expect(icon.classList.contains("stale")).toBe(true);
  });
});
