import { describe, it, expect } from "vitest";
import { createHttpObservationFetcher } from "../src/nws.ts";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const POINTS = {
  properties: {
    observationStations: "https://api.weather.gov/gridpoints/MLB/30,70/stations",
  },
};
const STATIONS = {
  features: [{ id: "https://api.weather.gov/stations/KMCO" }],
};

function fetcherFor(latest: unknown, pointsOk = true): typeof fetch {
  return (async (url: string) => {
    if (url.includes("/observations/latest")) {
      return jsonResponse(latest);
    }
    if (url.includes("/points/")) {
      return jsonResponse(POINTS, pointsOk, pointsOk ? 200 : 500);
    }
    return jsonResponse(STATIONS);
  }) as unknown as typeof fetch;
}

const signal = AbortSignal.timeout(5000);

describe("createHttpObservationFetcher", () => {
  it("resolves the nearest station and maps the latest observation (daytime icon)", async () => {
    const fetchImpl = fetcherFor({
      properties: {
        textDescription: "Clear",
        icon: "https://api.weather.gov/icons/land/day/skc?size=medium",
      },
    });
    const fetcher = createHttpObservationFetcher(28.5, -81.2, fetchImpl);

    const obs = await fetcher("contact@example.com", signal);
    expect(obs).toEqual({ textDescription: "Clear", isDaytime: true });
  });

  it("treats a missing or night icon as not daytime", async () => {
    const fetchImpl = fetcherFor({
      properties: { textDescription: "Clear", icon: null },
    });
    const fetcher = createHttpObservationFetcher(28.5, -81.2, fetchImpl);

    const obs = await fetcher("contact@example.com", signal);
    expect(obs.isDaytime).toBe(false);
  });

  it("throws on a non-ok NWS response so the client marks the icon stale", async () => {
    const fetchImpl = fetcherFor({ properties: {} }, false);
    const fetcher = createHttpObservationFetcher(28.5, -81.2, fetchImpl);

    await expect(fetcher("contact@example.com", signal)).rejects.toThrow("NWS 500");
  });
});
