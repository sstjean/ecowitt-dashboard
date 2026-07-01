import { describe, it, expect } from "vitest";
import type { SensorHealthEntry } from "@ecowitt/shared";
import {
  buildSignalBars,
  buildBatteryBadge,
  buildSensorIndicator,
} from "../src/render/sensorIndicator.ts";

const ws90: SensorHealthEntry = {
  id: "12FAD",
  img: "wh90",
  type: 48,
  name: "WS90",
  battery: "OK",
  batteryRaw: 5,
  signalBars: 4,
  rssiDbm: -74,
  registered: true,
  lastSeenUtc: "2026-06-22T20:19:00Z",
};

const wired: SensorHealthEntry = {
  id: "C7",
  img: "wh25",
  type: 4,
  name: "WH25",
  battery: "N/A",
  batteryRaw: 0,
  signalBars: null,
  rssiDbm: null,
  registered: true,
  lastSeenUtc: "2026-06-22T20:19:00Z",
};

describe("buildSignalBars", () => {
  it.each([0, 1, 2, 3, 4])("renders four bars with %i lit for a 0–4 count", (bars) => {
    const el = buildSignalBars(document, bars);
    expect(el.getAttribute("data-signal-bars")).toBe(String(bars));
    expect(el.querySelectorAll(".sig-bar")).toHaveLength(4);
    expect(el.querySelectorAll(".sig-bar.on")).toHaveLength(bars);
    expect(el.querySelectorAll(".sig-bar.off")).toHaveLength(4 - bars);
  });

  it("renders an explicit no-radio state for null (never empty bars implying 'lost')", () => {
    const el = buildSignalBars(document, null);
    expect(el.getAttribute("data-signal-bars")).toBe("na");
    expect(el.classList.contains("sig-bars--na")).toBe(true);
    // No four-bar strip that could misread as a live "0 of 4 / lost signal".
    expect(el.querySelectorAll(".sig-bar")).toHaveLength(0);
  });
});

describe("buildBatteryBadge", () => {
  it.each([
    ["OK", "batt-ok"],
    ["Low", "batt-low"],
    ["Unknown", "batt-unknown"],
    ["N/A", "batt-na"],
  ] as const)("renders a distinct %s cue with no numeric percentage", (status, cls) => {
    const el = buildBatteryBadge(document, status);
    expect(el.getAttribute("data-battery")).toBe(status);
    expect(el.classList.contains(cls)).toBe(true);
    // Flag/wired sensors must NEVER render a misleading "0%" / percentage (SC-004).
    expect(el.textContent ?? "").not.toMatch(/%/);
  });

  it("labels Low distinctly from OK (a low-battery cue, never '0%')", () => {
    const low = buildBatteryBadge(document, "Low");
    const ok = buildBatteryBadge(document, "OK");
    expect(low.textContent).not.toBe(ok.textContent);
    expect((low.textContent ?? "").toLowerCase()).toContain("low");
  });
});

describe("buildSensorIndicator", () => {
  it("shows bars + battery for a radio sensor keyed by its id", () => {
    const el = buildSensorIndicator(document, ws90, { radio: true });
    expect(el.getAttribute("data-sensor-indicator")).toBe("12FAD");
    expect(el.querySelector(".sig-bars")?.getAttribute("data-signal-bars")).toBe("4");
    expect(el.querySelector(".batt-badge")?.getAttribute("data-battery")).toBe("OK");
  });

  it("omits the radio strip entirely for a wired sensor and shows N/A", () => {
    const el = buildSensorIndicator(document, wired, { radio: false });
    expect(el.querySelector(".sig-bars")).toBeNull(); // no signal strip for wired
    expect(el.querySelector(".batt-badge")?.getAttribute("data-battery")).toBe("N/A");
  });

  it("renders an honest Unknown state for a null (stale/unavailable) entry", () => {
    const el = buildSensorIndicator(document, null, { radio: true });
    expect(el.getAttribute("data-sensor-indicator")).toBe("unknown");
    expect(el.querySelector(".batt-badge")?.getAttribute("data-battery")).toBe("Unknown");
    // Null health → no fabricated bars; the no-radio state, not "0 of 4".
    expect(el.querySelector(".sig-bars")?.getAttribute("data-signal-bars")).toBe("na");
  });
});
