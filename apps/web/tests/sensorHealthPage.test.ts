import { describe, it, expect, beforeEach } from "vitest";
import type { SensorHealth, SensorHealthEntry } from "@ecowitt/shared";
import { createSensorHealthPage } from "../src/render/sensorHealthPage.ts";

function entry(over: Partial<SensorHealthEntry> = {}): SensorHealthEntry {
  return {
    id: "1242D",
    img: "wh90",
    type: 48,
    name: "WS90",
    battery: "OK",
    batteryRaw: 5,
    signalBars: 4,
    rssiDbm: -74,
    registered: true,
    lastSeenUtc: "2026-06-22T20:19:00Z",
    ...over,
  };
}

const freshHealth: SensorHealth = {
  available: true,
  stale: false,
  capturedAtUtc: "2026-06-22T20:19:00Z",
  sensors: [
    entry(),
    entry({ id: "A0", img: "wh31", type: 7, name: "CH2", battery: "OK", batteryRaw: 0, signalBars: 4, rssiDbm: -96 }),
  ],
};

let page: ReturnType<typeof createSensorHealthPage>;
beforeEach(() => {
  page = createSensorHealthPage(document);
});

function rows(): HTMLElement[] {
  return [...page.element.querySelectorAll<HTMLElement>(".sh-row")];
}
function rowFor(id: string): HTMLElement {
  return page.element.querySelector<HTMLElement>(`.sh-row[data-sensor-id="${id}"]`)!;
}

describe("createSensorHealthPage", () => {
  it("is hidden by default so the kiosk default layout is byte-for-byte unchanged", () => {
    expect(page.element.hidden).toBe(true);
    expect(page.element.classList.contains("sensor-health-overlay")).toBe(true);
  });

  it("lists one row per registered sensor with name/model, battery, signal+rssi and last-seen", () => {
    page.update(freshHealth);
    expect(rows()).toHaveLength(2);

    const ws90 = rowFor("1242D");
    expect(ws90.querySelector(".sh-name")?.textContent).toContain("WS90");
    expect(ws90.querySelector(".sh-model")?.textContent).toContain("wh90");
    expect(ws90.querySelector(".batt-badge")?.getAttribute("data-battery")).toBe("OK");
    expect(ws90.querySelector(".sig-bars")?.getAttribute("data-signal-bars")).toBe("4");
    expect(ws90.querySelector(".sh-rssi")?.textContent).toContain("-74");
  });

  it("lists the wh31 CH2 (A0) on the health page", () => {
    page.update(freshHealth);
    const ch2 = rowFor("A0");
    expect(ch2.querySelector(".sh-name")?.textContent).toContain("CH2");
    expect(ch2.querySelector(".sh-model")?.textContent).toContain("wh31");
    expect(ch2.querySelector(".batt-badge")?.getAttribute("data-battery")).toBe("OK");
  });

  it("renders a no-radio state (no bars, no rssi, no '%') for a registered sensor with null signal/rssi", () => {
    page.update({
      ...freshHealth,
      sensors: [entry({ signalBars: null, rssiDbm: null, battery: "Unknown" })],
    });
    const row = rowFor("1242D");
    // No four-bar strip that could misread as a live "0 of 4"; no rssi; no percentage.
    expect(row.querySelectorAll(".sig-bar")).toHaveLength(0);
    expect(row.querySelector(".sig-bars")?.getAttribute("data-signal-bars")).toBe("na");
    expect(row.querySelector(".sh-rssi")).toBeNull();
    expect(row.textContent ?? "").not.toMatch(/%/);
  });

  it("renders a distinct Low-battery cue (never '0%')", () => {
    page.update({
      ...freshHealth,
      sensors: [entry({ battery: "Low", batteryRaw: 1 })],
    });
    const badge = rowFor("1242D").querySelector(".batt-badge")!;
    expect(badge.classList.contains("batt-low")).toBe(true);
    expect(badge.textContent ?? "").not.toMatch(/%/);
  });

  it("renders a lost-link state (0 lit bars) for a registered sensor reporting 0 signal", () => {
    page.update({ ...freshHealth, sensors: [entry({ signalBars: 0 })] });
    const strip = rowFor("1242D").querySelector(".sig-bars")!;
    expect(strip.querySelectorAll(".sig-bar.on")).toHaveLength(0);
    expect(strip.querySelectorAll(".sig-bar.off")).toHaveLength(4);
  });

  it("presents Unknown + a stale tag when the envelope is stale (never aged values as current)", () => {
    page.update({ ...freshHealth, stale: true });
    for (const row of rows()) {
      expect(row.classList.contains("sh-row--stale")).toBe(true);
      expect(row.querySelector(".sh-stale-tag")).not.toBeNull();
      expect(row.querySelector(".batt-badge")?.getAttribute("data-battery")).toBe("Unknown");
      // No aged "OK"/live bars shown as if current.
      expect(row.querySelector(".sig-bars")?.getAttribute("data-signal-bars")).toBe("na");
    }
  });

  it("presents Unknown + stale when the snapshot is unavailable (available:false)", () => {
    page.update({ ...freshHealth, available: false });
    expect(rows().every((r) => r.classList.contains("sh-row--stale"))).toBe(true);
  });

  it("shows an empty-state message (not fabricated rows) when no sensors are available", () => {
    page.update({ available: false, stale: true, capturedAtUtc: null, sensors: [] });
    expect(rows()).toHaveLength(0);
    expect(page.element.querySelector(".sh-empty")).not.toBeNull();
  });

  it("re-renders when the registered set changes (FR-015)", () => {
    page.update(freshHealth);
    expect(rows()).toHaveLength(2);
    page.update({ ...freshHealth, sensors: [entry()] });
    expect(rows()).toHaveLength(1);
    expect(rowFor("A0")).toBeNull();
  });

  it("renders every last-seen timestamp in America/New_York (NON-NEGOTIABLE TZ)", () => {
    page.update(freshHealth);
    // 20:19Z → 4:19 pm EDT.
    for (const row of rows()) {
      expect(row.querySelector(".sh-lastseen")?.textContent).toMatch(/Jun 22, 4:19 pm/);
    }
  });

  it("toggles visibility via show/hide/toggle and the close button", () => {
    expect(page.element.hidden).toBe(true);
    page.show();
    expect(page.element.hidden).toBe(false);
    page.hide();
    expect(page.element.hidden).toBe(true);
    page.toggle();
    expect(page.element.hidden).toBe(false);

    page.element.querySelector<HTMLButtonElement>(".sh-close")!.click();
    expect(page.element.hidden).toBe(true);
  });
});
