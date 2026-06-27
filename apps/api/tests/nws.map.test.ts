import { describe, it, expect } from "vitest";
import { isDaytime, resolveConditionIcon } from "../src/nws.ts";

// Household astro window for the day under test (injected; no SunCalc here).
const SUNRISE = "2026-06-21T10:00:00.000Z";
const SUNSET = "2026-06-21T23:00:00.000Z";
const DAY = new Date("2026-06-21T15:00:00.000Z"); // between sunrise & sunset
const NIGHT = new Date("2026-06-21T03:00:00.000Z"); // before sunrise

const byDay = (text: string): string => resolveConditionIcon(text, DAY, SUNRISE, SUNSET);
const byNight = (text: string): string =>
  resolveConditionIcon(text, NIGHT, SUNRISE, SUNSET);

describe("isDaytime", () => {
  it("is true strictly inside the [sunrise, sunset) window", () => {
    expect(isDaytime(DAY, SUNRISE, SUNSET)).toBe(true);
  });

  it("is false after sunset and before sunrise", () => {
    expect(isDaytime(new Date("2026-06-21T23:30:00.000Z"), SUNRISE, SUNSET)).toBe(false);
    expect(isDaytime(new Date("2026-06-21T09:00:00.000Z"), SUNRISE, SUNSET)).toBe(false);
  });

  it("treats the exact sunrise instant as day (boundary inclusive)", () => {
    expect(isDaytime(new Date(SUNRISE), SUNRISE, SUNSET)).toBe(true);
  });

  it("treats the exact sunset instant as night (half-open window)", () => {
    expect(isDaytime(new Date(SUNSET), SUNRISE, SUNSET)).toBe(false);
  });
});

describe("resolveConditionIcon", () => {
  it("maps clear skies to clear by day and night by night (astro-driven)", () => {
    expect(byDay("Clear")).toBe("clear");
    expect(byDay("Sunny")).toBe("clear");
    expect(byNight("Clear")).toBe("night");
    expect(byNight("Fair")).toBe("night");
  });

  it("resolves empty text from astro: clear by day, night by night (never false night)", () => {
    expect(byDay("")).toBe("clear");
    expect(byNight("")).toBe("night");
  });

  it("maps cloud cover across the partly/mostly/overcast vocabulary", () => {
    expect(byDay("Partly Cloudy")).toBe("partly-cloudy");
    expect(byDay("Mostly Cloudy")).toBe("cloudy");
    expect(byDay("Cloudy")).toBe("cloudy");
    expect(byDay("Overcast")).toBe("cloudy");
  });

  it("maps precipitation and obscuration keywords", () => {
    expect(byDay("Light Rain")).toBe("rainy");
    expect(byDay("Drizzle")).toBe("rainy");
    expect(byDay("Snow")).toBe("snow");
    expect(byDay("Light Sleet")).toBe("snow");
    expect(byDay("Fog")).toBe("fog");
    expect(byDay("Haze")).toBe("fog");
    expect(byDay("Thunderstorm")).toBe("thunderstorm");
  });

  it("prioritises thunderstorms even when the description mentions rain", () => {
    expect(byDay("Thunderstorm and Rain")).toBe("thunderstorm");
  });

  it("lets precip/cloud keywords win regardless of day vs night", () => {
    // Keyword/cloud-cover precedence is day/night agnostic (FR-008).
    expect(byNight("Thunderstorm and Rain")).toBe("thunderstorm");
    expect(byNight("Light Rain")).toBe("rainy");
    expect(byNight("Snow")).toBe("snow");
    expect(byNight("Fog")).toBe("fog");
    expect(byNight("Mostly Cloudy")).toBe("cloudy");
    expect(byNight("Partly Cloudy")).toBe("partly-cloudy");
  });

  it("never consults a NWS icon URL: identical inputs always yield one result (FR-003)", () => {
    // The function takes no icon argument, so the deprecated field can never
    // influence the result. Three identical calls must be byte-identical.
    const a = resolveConditionIcon("Clear", DAY, SUNRISE, SUNSET);
    const b = resolveConditionIcon("Clear", DAY, SUNRISE, SUNSET);
    const c = resolveConditionIcon("Clear", DAY, SUNRISE, SUNSET);
    expect(a).toBe("clear");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });
});
