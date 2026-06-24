import { describe, it, expect } from "vitest";
import { astronomicalDataSchema } from "@ecowitt/shared";
import { computeAstro } from "../src/enrich.ts";

const LAT = 40.0;
const LON = -75.0;

describe("computeAstro", () => {
  it("returns schema-valid SunCalc-derived astronomical data", () => {
    const astro = computeAstro(LAT, LON, new Date("2026-06-21T16:00:00Z"));
    expect(() => astronomicalDataSchema.parse(astro)).not.toThrow();
    expect(Number.isNaN(Date.parse(astro.sunriseUtc))).toBe(false);
    expect(Number.isNaN(Date.parse(astro.sunsetUtc))).toBe(false);
  });

  it("reports a positive sun altitude fraction at local midday", () => {
    const astro = computeAstro(LAT, LON, new Date("2026-06-21T16:00:00Z"));
    expect(astro.sunAltitudeFraction).toBeGreaterThan(0);
    expect(astro.sunAltitudeFraction).toBeLessThanOrEqual(1);
  });

  it("clamps the sun altitude fraction to 0 overnight", () => {
    const astro = computeAstro(LAT, LON, new Date("2026-06-21T05:00:00Z"));
    expect(astro.sunAltitudeFraction).toBe(0);
  });

  it("reports a moon phase in [0,1]", () => {
    const astro = computeAstro(LAT, LON, new Date("2026-06-21T16:00:00Z"));
    expect(astro.moonPhase).toBeGreaterThanOrEqual(0);
    expect(astro.moonPhase).toBeLessThanOrEqual(1);
  });
});
