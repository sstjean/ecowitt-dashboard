import { describe, it, expect } from "vitest";
import { formatEasternDate, formatEasternTime } from "../src/format/eastern.ts";

describe("formatEasternDate", () => {
  it("renders a full weekday/month/ordinal-day/year in Eastern (EDT in summer)", () => {
    // 22:05Z in June is 18:05 EDT (UTC-4), still June 19.
    const d = new Date("2026-06-19T22:05:00Z");
    expect(formatEasternDate(d)).toBe("Friday, June 19th, 2026");
  });

  it("renders the Eastern calendar date in winter (EST, UTC-5)", () => {
    const d = new Date("2026-01-15T22:05:00Z");
    expect(formatEasternDate(d)).toBe("Thursday, January 15th, 2026");
  });

  it("shifts the calendar day across the Eastern midnight boundary", () => {
    // 02:30Z on the 20th is 22:30 EDT on the 19th.
    const d = new Date("2026-06-20T02:30:00Z");
    expect(formatEasternDate(d)).toContain("June 19th, 2026");
  });

  it.each([
    ["2026-09-01T16:00:00Z", "September 1st, 2026"],
    ["2026-09-02T16:00:00Z", "September 2nd, 2026"],
    ["2026-09-03T16:00:00Z", "September 3rd, 2026"],
    ["2026-09-04T16:00:00Z", "September 4th, 2026"],
    ["2026-09-11T16:00:00Z", "September 11th, 2026"],
    ["2026-09-12T16:00:00Z", "September 12th, 2026"],
    ["2026-09-13T16:00:00Z", "September 13th, 2026"],
    ["2026-09-21T16:00:00Z", "September 21st, 2026"],
    ["2026-09-22T16:00:00Z", "September 22nd, 2026"],
    ["2026-09-23T16:00:00Z", "September 23rd, 2026"],
  ])("applies the correct ordinal suffix for %s", (iso, expected) => {
    expect(formatEasternDate(new Date(iso))).toContain(expected);
  });
});

describe("formatEasternTime", () => {
  it("renders 12-hour Eastern time in summer (EDT)", () => {
    expect(formatEasternTime(new Date("2026-06-19T22:05:00Z"))).toBe("6:05 pm");
  });

  it("renders 12-hour Eastern time in winter (EST)", () => {
    expect(formatEasternTime(new Date("2026-01-15T22:05:00Z"))).toBe("5:05 pm");
  });

  it("renders midnight as 12:00 AM Eastern", () => {
    // 04:00Z = 12:00 AM EDT.
    expect(formatEasternTime(new Date("2026-06-20T04:00:00Z"))).toBe("12:00 am");
  });
});
