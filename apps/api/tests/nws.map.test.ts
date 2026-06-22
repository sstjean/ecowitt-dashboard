import { describe, it, expect } from "vitest";
import { conditionIcon, type NwsObservation } from "../src/nws.ts";

function obs(textDescription: string, isDaytime = true): NwsObservation {
  return { textDescription, isDaytime };
}

describe("conditionIcon", () => {
  it("maps clear skies to clear by day and night by night", () => {
    expect(conditionIcon(obs("Clear", true))).toBe("clear");
    expect(conditionIcon(obs("Sunny", true))).toBe("clear");
    expect(conditionIcon(obs("Clear", false))).toBe("night");
    expect(conditionIcon(obs("Fair", false))).toBe("night");
  });

  it("maps cloud cover across the partly/mostly/overcast vocabulary", () => {
    expect(conditionIcon(obs("Partly Cloudy"))).toBe("partly-cloudy");
    expect(conditionIcon(obs("Mostly Cloudy"))).toBe("cloudy");
    expect(conditionIcon(obs("Cloudy"))).toBe("cloudy");
    expect(conditionIcon(obs("Overcast"))).toBe("cloudy");
  });

  it("maps precipitation and obscuration keywords", () => {
    expect(conditionIcon(obs("Light Rain"))).toBe("rainy");
    expect(conditionIcon(obs("Drizzle"))).toBe("rainy");
    expect(conditionIcon(obs("Snow"))).toBe("snow");
    expect(conditionIcon(obs("Light Sleet"))).toBe("snow");
    expect(conditionIcon(obs("Fog"))).toBe("fog");
    expect(conditionIcon(obs("Haze"))).toBe("fog");
    expect(conditionIcon(obs("Thunderstorm"))).toBe("thunderstorm");
  });

  it("prioritises thunderstorms even when the description mentions rain", () => {
    expect(conditionIcon(obs("Thunderstorm and Rain"))).toBe("thunderstorm");
  });
});
