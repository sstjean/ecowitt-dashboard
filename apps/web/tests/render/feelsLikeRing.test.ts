import { describe, it, expect } from "vitest";
import { renderFeelsLikeRing } from "../../src/render/feelsLikeRing.ts";
import { tempGradientStops } from "../../src/render/tempScale.ts";

describe("renderFeelsLikeRing", () => {
  it("renders the feels-like centerpiece with a degree unit and label", () => {
    const root = document.createElement("div");
    renderFeelsLikeRing(root, { feelsLikeF: 70.6 });
    expect(root.querySelector("[data-feels]")?.textContent).toBe("71");
    expect(root.querySelector(".ring-center .unit")?.textContent).toBe("°");
    expect(root.querySelector(".glabel")?.textContent).toBe("Feels Like");
  });

  it("colours the ring from the shared scale (correct at 105F)", () => {
    const root = document.createElement("div");
    renderFeelsLikeRing(root, { feelsLikeF: 105 });
    const stop = root.querySelector("linearGradient stop.g0");
    expect(stop?.getAttribute("stop-color")).toBe(tempGradientStops(105).light);
  });

  it("replaces prior content when re-rendered", () => {
    const root = document.createElement("div");
    renderFeelsLikeRing(root, { feelsLikeF: 70 });
    renderFeelsLikeRing(root, { feelsLikeF: 88 });
    expect(root.querySelectorAll("[data-feels]")).toHaveLength(1);
    expect(root.querySelector("[data-feels]")?.textContent).toBe("88");
  });
});
