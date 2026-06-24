import { describe, it, expect } from "vitest";
import { deriveFreshness } from "../src/freshness.ts";

const NOW = Date.parse("2026-06-21T18:05:00Z");
const CADENCE = 30; // seconds; stale threshold = 3x = 90s

describe("deriveFreshness", () => {
  it("returns 'missing' when observedAt is null", () => {
    expect(deriveFreshness(null, NOW, CADENCE)).toBe("missing");
  });

  it("returns 'fresh' for a reading within 3x the poll cadence", () => {
    const at = new Date(NOW - 60_000).toISOString();
    expect(deriveFreshness(at, NOW, CADENCE)).toBe("fresh");
  });

  it("returns 'stale' for a reading older than 3x the poll cadence", () => {
    const at = new Date(NOW - 120_000).toISOString();
    expect(deriveFreshness(at, NOW, CADENCE)).toBe("stale");
  });

  it("treats exactly 3x cadence as still fresh (boundary)", () => {
    const at = new Date(NOW - 90_000).toISOString();
    expect(deriveFreshness(at, NOW, CADENCE)).toBe("fresh");
  });

  it("returns 'fresh' for a future-stamped reading (clock skew)", () => {
    const at = new Date(NOW + 5_000).toISOString();
    expect(deriveFreshness(at, NOW, CADENCE)).toBe("fresh");
  });

  it("returns 'missing' for an unparseable timestamp", () => {
    expect(deriveFreshness("not-a-date", NOW, CADENCE)).toBe("missing");
  });
});
