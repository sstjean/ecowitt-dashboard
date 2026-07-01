import { describe, it, expect } from "vitest";
import { sensorCardMap } from "../src/sensorCardMap.ts";

/**
 * The static card→sensor map (US2 / FR-008). The single WS90 (`1242D`) backs the
 * outdoor/solar/rain cards. Indoor/baro have **no** backing `get_sensors_info`
 * radio (the wired wh25 is reported only in `get_livedata_info`), so they are
 * absent from the map entirely and render no indicator. The wh31 (`A0`) is
 * health-page-only (no dashboard card).
 */
describe("sensorCardMap", () => {
  it("maps outdoor/solar/rain to the one WS90 radio (1242D) and nothing else", () => {
    const byPanel = Object.fromEntries(sensorCardMap.map((b) => [b.panel, b]));
    expect(byPanel.outdoor).toEqual({ panel: "outdoor", sensorId: "1242D", radio: true });
    expect(byPanel.solar).toEqual({ panel: "solar", sensorId: "1242D", radio: true });
    expect(byPanel.rain).toEqual({ panel: "rain", sensorId: "1242D", radio: true });
    expect(sensorCardMap).toHaveLength(3);
  });

  it("resolves all three WS90-backed cards to the SAME one WS90 record (not three radios)", () => {
    const ws90Panels = sensorCardMap.filter((b) => b.radio).map((b) => b.sensorId);
    expect(ws90Panels).toEqual(["1242D", "1242D", "1242D"]);
    expect(new Set(ws90Panels).size).toBe(1); // one physical radio
  });

  it("has NO indoor/baro binding — the wired wh25 is not in get_sensors_info", () => {
    expect(sensorCardMap.some((b) => b.panel === "indoor")).toBe(false);
    expect(sensorCardMap.some((b) => b.panel === "baro")).toBe(false);
    // No invented wired wh25 (`C7`) row backs any card.
    expect(sensorCardMap.some((b) => b.sensorId === "C7")).toBe(false);
  });

  it("has no card for the wh31 CH2 (A0) — it appears only on the health page", () => {
    expect(sensorCardMap.some((b) => b.sensorId === "A0")).toBe(false);
  });
});
