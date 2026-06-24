import { describe, it, expect } from "vitest";
import { loadPollerConfig } from "../src/config.ts";

function baseEnv(): Record<string, string> {
  return {
    GATEWAY_BASE_URL: "http://192.168.20.50",
    SQLITE_PATH: "/data/readings.db",
    HOUSEHOLD_LAT: "40.0150",
    HOUSEHOLD_LON: "-105.2705",
  };
}

describe("loadPollerConfig", () => {
  it("parses a complete environment with typed values", () => {
    const cfg = loadPollerConfig({ ...baseEnv(), POLL_CADENCE_SECONDS: "45" });
    expect(cfg).toEqual({
      source: "gateway",
      gatewayBaseUrl: "http://192.168.20.50",
      sqlitePath: "/data/readings.db",
      householdLat: 40.015,
      householdLon: -105.2705,
      pollCadenceSeconds: 45,
    });
  });

  it("defaults POLL_CADENCE_SECONDS to 30 when absent", () => {
    expect(loadPollerConfig(baseEnv()).pollCadenceSeconds).toBe(30);
  });

  it("clamps a below-range cadence up to 30", () => {
    expect(
      loadPollerConfig({ ...baseEnv(), POLL_CADENCE_SECONDS: "5" }).pollCadenceSeconds,
    ).toBe(30);
  });

  it("clamps an above-range cadence down to 60", () => {
    expect(
      loadPollerConfig({ ...baseEnv(), POLL_CADENCE_SECONDS: "120" }).pollCadenceSeconds,
    ).toBe(60);
  });

  it("rejects a non-numeric cadence", () => {
    expect(() =>
      loadPollerConfig({ ...baseEnv(), POLL_CADENCE_SECONDS: "soon" }),
    ).toThrow();
  });

  it("rejects a missing GATEWAY_BASE_URL", () => {
    const env = baseEnv();
    delete (env as Record<string, string>).GATEWAY_BASE_URL;
    expect(() => loadPollerConfig(env)).toThrow();
  });

  it("rejects a malformed GATEWAY_BASE_URL", () => {
    expect(() => loadPollerConfig({ ...baseEnv(), GATEWAY_BASE_URL: "not a url" })).toThrow();
  });

  it("rejects a missing SQLITE_PATH", () => {
    const env = baseEnv();
    delete (env as Record<string, string>).SQLITE_PATH;
    expect(() => loadPollerConfig(env)).toThrow();
  });

  it("rejects a missing HOUSEHOLD_LAT", () => {
    const env = baseEnv();
    delete (env as Record<string, string>).HOUSEHOLD_LAT;
    expect(() => loadPollerConfig(env)).toThrow();
  });

  it("rejects an out-of-range HOUSEHOLD_LON", () => {
    expect(() => loadPollerConfig({ ...baseEnv(), HOUSEHOLD_LON: "200" })).toThrow();
  });
});

function cloudEnv(): Record<string, string> {
  return {
    POLLER_SOURCE: "cloud",
    SQLITE_PATH: "/data/readings.db",
    HOUSEHOLD_LAT: "40.0150",
    HOUSEHOLD_LON: "-105.2705",
    ECOWITT_APP_KEY: "app-key",
    ECOWITT_API_KEY: "api-key",
    ECOWITT_MAC: "AA:BB:CC:DD:EE:FF",
  };
}

describe("loadPollerConfig — source switch (LiveMock)", () => {
  it("defaults POLLER_SOURCE to gateway when unset", () => {
    expect(loadPollerConfig(baseEnv()).source).toBe("gateway");
  });

  it("accepts POLLER_SOURCE=cloud and parses the ECOWITT_* credentials", () => {
    const cfg = loadPollerConfig(cloudEnv());
    expect(cfg).toEqual({
      source: "cloud",
      sqlitePath: "/data/readings.db",
      householdLat: 40.015,
      householdLon: -105.2705,
      pollCadenceSeconds: 30,
      ecowittAppKey: "app-key",
      ecowittApiKey: "api-key",
      ecowittMac: "AA:BB:CC:DD:EE:FF",
      ecowittApiBaseUrl: "https://api.ecowitt.net",
    });
  });

  it("defaults ECOWITT_API_BASE_URL to https://api.ecowitt.net", () => {
    expect(loadPollerConfig(cloudEnv()).ecowittApiBaseUrl).toBe(
      "https://api.ecowitt.net",
    );
  });

  it("accepts an explicit ECOWITT_API_BASE_URL", () => {
    const cfg = loadPollerConfig({
      ...cloudEnv(),
      ECOWITT_API_BASE_URL: "https://example.test",
    });
    expect(cfg.ecowittApiBaseUrl).toBe("https://example.test");
  });

  it("rejects an invalid POLLER_SOURCE", () => {
    expect(() => loadPollerConfig({ ...baseEnv(), POLLER_SOURCE: "satellite" })).toThrow();
  });

  it("does not require GATEWAY_BASE_URL when source=cloud", () => {
    expect(() => loadPollerConfig(cloudEnv())).not.toThrow();
  });

  it("treats an empty GATEWAY_BASE_URL as absent when source=cloud", () => {
    expect(() => loadPollerConfig({ ...cloudEnv(), GATEWAY_BASE_URL: "" })).not.toThrow();
  });

  it("throws when source=gateway but GATEWAY_BASE_URL is empty", () => {
    expect(() => loadPollerConfig({ ...baseEnv(), GATEWAY_BASE_URL: "" })).toThrow();
  });

  it("throws when source=cloud but ECOWITT_APP_KEY is missing", () => {
    const env = cloudEnv();
    delete (env as Record<string, string>).ECOWITT_APP_KEY;
    expect(() => loadPollerConfig(env)).toThrow();
  });

  it("throws when source=cloud but ECOWITT_API_KEY is empty", () => {
    expect(() => loadPollerConfig({ ...cloudEnv(), ECOWITT_API_KEY: "" })).toThrow();
  });

  it("throws when source=cloud but ECOWITT_MAC is missing", () => {
    const env = cloudEnv();
    delete (env as Record<string, string>).ECOWITT_MAC;
    expect(() => loadPollerConfig(env)).toThrow();
  });

  it("rejects a malformed ECOWITT_API_BASE_URL", () => {
    expect(() =>
      loadPollerConfig({ ...cloudEnv(), ECOWITT_API_BASE_URL: "not a url" }),
    ).toThrow();
  });
});
