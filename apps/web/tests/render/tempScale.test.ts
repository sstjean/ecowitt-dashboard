import { describe, it, expect } from "vitest";
import {
  TEMP_STOPS,
  hexToRgb,
  tempColorRgb,
  tempColor,
  shade,
  tempGradientStops,
} from "../../src/render/tempScale.ts";

describe("tempColorRgb", () => {
  it("clamps below the coldest stop to violet", () => {
    expect(tempColorRgb(-20)).toEqual([138, 43, 226]); // #8a2be2
    expect(tempColorRgb(10)).toEqual([138, 43, 226]);
  });

  it("clamps above the hottest stop to extreme red", () => {
    expect(tempColorRgb(120)).toEqual([214, 31, 31]); // #d61f1f
    expect(tempColorRgb(200)).toEqual([214, 31, 31]);
  });

  it("returns the exact anchor colour at a stop", () => {
    expect(tempColorRgb(62)).toEqual([52, 199, 89]); // #34c759 green
  });

  it("linearly interpolates between two adjacent stops", () => {
    // halfway between 10 (#8a2be2) and 25 (#4a4fe0)
    expect(tempColorRgb(17.5)).toEqual([106, 61, 225]);
  });

  it("maps >=100F to a legible hot red (red dominates)", () => {
    const [r, g, b] = tempColorRgb(105);
    expect(r).toBeGreaterThan(200);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it("ramps smoothly with no banding (small per-degree channel deltas)", () => {
    let prev = tempColorRgb(10);
    for (let t = 11; t <= 120; t++) {
      const next = tempColorRgb(t);
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(next[c]! - prev[c]!)).toBeLessThanOrEqual(20);
      }
      prev = next;
    }
  });
});

describe("helpers", () => {
  it("hexToRgb parses a #rrggbb string", () => {
    expect(hexToRgb("#34c759")).toEqual([52, 199, 89]);
  });

  it("tempColor returns a css rgb() string", () => {
    expect(tempColor(62)).toBe("rgb(52, 199, 89)");
  });

  it("exposes the design-language anchor stops", () => {
    expect(TEMP_STOPS[0]).toEqual([10, "#8a2be2"]);
    expect(TEMP_STOPS[TEMP_STOPS.length - 1]).toEqual([120, "#d61f1f"]);
  });
});

describe("shade", () => {
  it("lightens toward white for positive amounts", () => {
    expect(shade([100, 100, 100], 0.5)).toEqual([178, 178, 178]);
  });

  it("darkens toward black for negative amounts", () => {
    expect(shade([100, 100, 100], -0.5)).toEqual([50, 50, 50]);
  });
});

describe("tempGradientStops", () => {
  it("returns a light/dark css pair bracketing the base colour", () => {
    const { light, dark } = tempGradientStops(62);
    expect(light).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(dark).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(light).not.toBe(dark);
  });
});
