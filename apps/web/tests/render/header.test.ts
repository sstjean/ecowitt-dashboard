import { describe, it, expect, vi, afterEach } from "vitest";
import { createHeader } from "../../src/render/header.ts";

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
    expect(header.element.querySelector(".h-time")?.textContent).toBe("2:05:09 PM");
  });

  it("ticks the clock every second from the injected clock", () => {
    vi.useFakeTimers();
    let now = new Date("2026-06-19T18:05:09Z");
    const header = createHeader(document);
    const stop = header.start(() => now);
    expect(header.element.querySelector(".h-time")?.textContent).toBe("2:05:09 PM");

    now = new Date("2026-06-19T18:05:10Z");
    vi.advanceTimersByTime(1000);
    expect(header.element.querySelector(".h-time")?.textContent).toBe("2:05:10 PM");

    stop();
    now = new Date("2026-06-19T18:05:11Z");
    vi.advanceTimersByTime(1000);
    // stopped: no further updates
    expect(header.element.querySelector(".h-time")?.textContent).toBe("2:05:10 PM");
  });

  it("defaults the clock to the system time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T18:05:09Z"));
    const header = createHeader(document);
    const stop = header.start();
    expect(header.element.querySelector(".h-time")?.textContent).toBe("2:05:09 PM");
    stop();
  });

  it("offers in-app nav with Live active and the rest as placeholders", () => {
    const header = createHeader(document);
    const items = [...header.element.querySelectorAll(".nav-item")].map((n) => n.textContent);
    expect(items).toEqual(["Live", "History", "Trends", "Records", "Settings"]);

    const live = header.element.querySelector(".nav-item.active")!;
    expect(live.textContent).toBe("Live");
    expect(live.getAttribute("aria-current")).toBe("page");
    expect(
      header.element.querySelector<HTMLElement>('.nav-item:not(.active)')!.getAttribute(
        "aria-disabled",
      ),
    ).toBe("true");
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
