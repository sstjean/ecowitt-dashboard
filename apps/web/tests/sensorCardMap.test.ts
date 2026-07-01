import { describe, it, expect } from "vitest";
import { sensorCardMap } from "../src/sensorCardMap.ts";

/**
 * The static card→sensor map (US2 / FR-008). The single WS90 (`12FAD`) backs the
 * outdoor/solar/rain cards; the wired wh25 (`C7`) backs indoor/baro with no radio
 * indicator; the wh31 (`A0`) is health-page-only (no dashboard card).
 */
describe("sensorCardMap", () => {
  it("maps outdoor/solar/rain to the one WS90 radio and indoor/baro to the wired wh25", () => {
    const byPanel = Object.fromEntries(sensorCardMap.map((b) => [b.panel, b]));
    expect(byPanel.outdoor).toEqual({ panel: "outdoor", sensorId: "12FAD", radio: true });
    expect(byPanel.solar).toEqual({ panel: "solar", sensorId: "12FAD", radio: true });
    expect(byPanel.rain).toEqual({ panel: "rain", sensorId: "12FAD", radio: true });
    expect(byPanel.indoor).toEqual({ panel: "indoor", sensorId: "C7", radio: false });
    expect(byPanel.baro).toEqual({ panel: "baro", sensorId: "C7", radio: false });
  });

  it("resolves all three WS90-backed cards to the SAME one WS90 record (not three radios)", () => {
    const ws90Panels = sensorCardMap.filter((b) => b.radio).map((b) => b.sensorId);
    expect(ws90Panels).toEqual(["12FAD", "12FAD", "12FAD"]);
    expect(new Set(ws90Panels).size).toBe(1); // one physical radio
  });

  it("marks the wired wh25 cards as non-radio (N/A battery, no signal strip)", () => {
    const wired = sensorCardMap.filter((b) => !b.radio);
    expect(wired.map((b) => b.panel)).toEqual(["indoor", "baro"]);
    expect(wired.every((b) => b.sensorId === "C7")).toBe(true);
  });

  it("has no card for the wh31 CH2 (A0) — it appears only on the health page", () => {
    expect(sensorCardMap.some((b) => b.sensorId === "A0")).toBe(false);
  });
});
