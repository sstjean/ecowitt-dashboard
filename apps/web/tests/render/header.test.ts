import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHeader } from "../../src/render/header.ts";

const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

afterEach(() => {
  vi.useRealTimers();
});

describe("createHeader", () => {
  it("builds a three-zone header (menu, date, time)", () => {
    const header = createHeader(document);
    expect(header.element.querySelector(".hamburger")).not.toBeNull();
    expect(header.element.querySelector(".h-date")).not.toBeNull();
    expect(header.element.querySelector(".h-time")).not.toBeNull();
  });

  it("centres the date with an ordinal suffix and shows 12-hour Eastern time", () => {
    const header = createHeader(document);
    header.update(new Date("2026-06-19T18:05:09Z"));
    expect(header.element.querySelector(".h-date")?.textContent).toBe(
      "Friday, June 19th, 2026",
    );
    // 18:05:09 UTC = 2:05:09 PM EDT
    expect(header.element.querySelector(".h-time")?.textContent).toBe("2:05:09 pm");
  });

  it("ticks the clock every second from the injected clock", () => {
    vi.useFakeTimers();
    let now = new Date("2026-06-19T18:05:09Z");
    const header = createHeader(document);
    const stop = header.start(() => now);
    expect(header.element.querySelector(".h-time")?.textContent).toBe("2:05:09 pm");

    now = new Date("2026-06-19T18:05:10Z");
    vi.advanceTimersByTime(1000);
    expect(header.element.querySelector(".h-time")?.textContent).toBe("2:05:10 pm");

    stop();
    now = new Date("2026-06-19T18:05:11Z");
    vi.advanceTimersByTime(1000);
    // stopped: no further updates
    expect(header.element.querySelector(".h-time")?.textContent).toBe("2:05:10 pm");
  });

  it("defaults the clock to the system time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T18:05:09Z"));
    const header = createHeader(document);
    const stop = header.start();
    expect(header.element.querySelector(".h-time")?.textContent).toBe("2:05:09 pm");
    stop();
  });

  it("offers in-app nav with Live active and the rest as placeholders", () => {
    const header = createHeader(document);
    const items = [...header.element.querySelectorAll(".nav-item")].map((n) => n.textContent);
    expect(items).toEqual(["Live", "Sensors", "History", "Trends", "Records", "Settings"]);

    const live = header.element.querySelector(".nav-item.active")!;
    expect(live.textContent).toBe("Live");
    expect(live.getAttribute("aria-current")).toBe("page");
    // History remains a disabled placeholder (Sensors is an enabled action, not a placeholder).
    const history = [...header.element.querySelectorAll<HTMLElement>(".nav-item")].find(
      (n) => n.textContent === "History",
    )!;
    expect(history.getAttribute("aria-disabled")).toBe("true");
  });

  it("adds an enabled 'Sensors' item that fires onSensors and closes the menu", () => {
    const onSensors = vi.fn();
    const header = createHeader(document, { onSensors });
    const hamburger = header.element.querySelector<HTMLButtonElement>(".hamburger")!;
    const nav = header.element.querySelector<HTMLElement>(".h-nav")!;
    hamburger.click(); // open the menu
    expect(nav.hidden).toBe(false);

    const sensors = [...header.element.querySelectorAll<HTMLElement>(".nav-item")].find(
      (n) => n.textContent === "Sensors",
    )!;
    // Sensors is an actionable item, not a disabled placeholder.
    expect(sensors.getAttribute("aria-disabled")).toBeNull();

    sensors.click();
    expect(onSensors).toHaveBeenCalledTimes(1);
    // Selecting Sensors collapses the menu (single-viewport kiosk affordance).
    expect(nav.hidden).toBe(true);
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");
  });

  it("no-ops the Sensors item safely when no onSensors handler is supplied", () => {
    const header = createHeader(document);
    const sensors = [...header.element.querySelectorAll<HTMLElement>(".nav-item")].find(
      (n) => n.textContent === "Sensors",
    )!;
    // Must not throw when the optional handler is absent.
    expect(() => sensors.click()).not.toThrow();
  });

  it("enlarges the hamburger + nav-item hit areas and font for kiosk legibility", () => {
    // The menu is the access path to the health overlay; per Feature 004 it must
    // be comfortably touch-friendly and legible at wall distance (FR-017).
    const pxIn = (block: string | undefined, prop: string): number => {
      const value = block?.match(new RegExp(`${prop}:\\s*(\\d+)px`))?.[1];
      if (value === undefined) throw new Error(`${prop} not found in block`);
      return Number(value);
    };
    const navBlock = css.match(/\.nav-item\s*\{([^}]*)\}/)?.[1];
    expect(pxIn(navBlock, "font-size")).toBeGreaterThan(14); // beyond the cramped 14px default
    expect(pxIn(navBlock, "min-height")).toBeGreaterThanOrEqual(52);

    const hamburgerBlock = css.match(/\.hamburger\s*\{([^}]*)\}/)?.[1];
    expect(pxIn(hamburgerBlock, "width")).toBeGreaterThanOrEqual(56); // enlarged beyond 46px
  });

  it("toggles the nav open and closed from the hamburger, tracking aria-expanded", () => {
    const header = createHeader(document);
    const hamburger = header.element.querySelector<HTMLButtonElement>(".hamburger")!;
    const nav = header.element.querySelector<HTMLElement>(".h-nav")!;

    expect(nav.hidden).toBe(true);
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");

    hamburger.click();
    expect(nav.hidden).toBe(false);
    expect(hamburger.getAttribute("aria-expanded")).toBe("true");

    hamburger.click();
    expect(nav.hidden).toBe(true);
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");
  });
});
