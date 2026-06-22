import { describe, it, expect } from "vitest";
import type { StoredReading } from "../src/store.ts";
import { deriveBaroTrend } from "../src/enrich.ts";

function stored(observedAt: string, pressureHpa: number): StoredReading {
  return { observedAt, metrics: { pressureHpa } };
}

const WINDOW_HOURS = 3;
const EPSILON = 0.3;

describe("deriveBaroTrend", () => {
  it("reports rising when the 3h delta exceeds the dead-band", () => {
    const trend = deriveBaroTrend(
      [stored("2026-06-21T12:30:00Z", 1010), stored("2026-06-21T15:30:00Z", 1012)],
      WINDOW_HOURS,
      EPSILON,
    );
    expect(trend).toEqual({ direction: "rising", deltaHpa: 2 });
  });

  it("reports falling when the 3h delta is below the negative dead-band", () => {
    const trend = deriveBaroTrend(
      [stored("2026-06-21T12:30:00Z", 1015), stored("2026-06-21T15:30:00Z", 1012)],
      WINDOW_HOURS,
      EPSILON,
    );
    expect(trend.direction).toBe("falling");
    expect(trend.deltaHpa).toBeCloseTo(-3, 6);
  });

  it("reports steady inside the dead-band, including the epsilon boundary", () => {
    const inside = deriveBaroTrend(
      [stored("2026-06-21T12:30:00Z", 1012), stored("2026-06-21T15:30:00Z", 1012.2)],
      WINDOW_HOURS,
      EPSILON,
    );
    expect(inside.direction).toBe("steady");

    const boundary = deriveBaroTrend(
      [stored("2026-06-21T12:30:00Z", 1012), stored("2026-06-21T15:30:00Z", 1012.3)],
      WINDOW_HOURS,
      EPSILON,
    );
    expect(boundary.direction).toBe("steady"); // |0.3| <= 0.3
  });

  it("reports unavailable with fewer than 3h of history (never a fabricated steady)", () => {
    const tooShort = deriveBaroTrend(
      [stored("2026-06-21T14:30:00Z", 1010), stored("2026-06-21T15:30:00Z", 1012)],
      WINDOW_HOURS,
      EPSILON,
    );
    expect(tooShort).toEqual({ direction: "unavailable", deltaHpa: null });
  });

  it("reports unavailable for an empty or single-reading window", () => {
    expect(deriveBaroTrend([], WINDOW_HOURS, EPSILON)).toEqual({
      direction: "unavailable",
      deltaHpa: null,
    });
    expect(
      deriveBaroTrend([stored("2026-06-21T15:30:00Z", 1012)], WINDOW_HOURS, EPSILON),
    ).toEqual({ direction: "unavailable", deltaHpa: null });
  });
});
