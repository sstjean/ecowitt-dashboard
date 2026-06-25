import { describe, it, expect } from "vitest";
import type { StoredReading } from "../src/store.ts";
import { deriveBaroTrend } from "../src/enrich.ts";

function stored(observedAt: string, pressureHpa: number): StoredReading {
  return { observedAt, metrics: { pressureHpa } };
}

const WINDOW_HOURS = 3;
const EPSILON = 0.3;
const NOW = new Date("2026-06-21T15:30:00Z");

describe("deriveBaroTrend", () => {
  it("reports rising when the 3h delta exceeds the dead-band, anchored ~3h back", () => {
    const trend = deriveBaroTrend(
      [
        stored("2026-06-21T11:00:00Z", 1009),
        stored("2026-06-21T12:30:00Z", 1010),
        stored("2026-06-21T15:30:00Z", 1012),
      ],
      WINDOW_HOURS,
      EPSILON,
      NOW,
    );
    // Anchored on the 12:30 reading (closest to now-3h), not the oldest 11:00 one.
    expect(trend).toEqual({ direction: "rising", deltaHpa: 2, etaMinutes: null });
  });

  it("reports falling when the 3h delta is below the negative dead-band", () => {
    const trend = deriveBaroTrend(
      [stored("2026-06-21T12:30:00Z", 1015), stored("2026-06-21T15:30:00Z", 1012)],
      WINDOW_HOURS,
      EPSILON,
      NOW,
    );
    expect(trend.direction).toBe("falling");
    expect(trend.deltaHpa).toBeCloseTo(-3, 6);
    expect(trend.etaMinutes).toBeNull();
  });

  it("reports steady inside the dead-band, including the epsilon boundary", () => {
    const inside = deriveBaroTrend(
      [stored("2026-06-21T12:30:00Z", 1012), stored("2026-06-21T15:30:00Z", 1012.2)],
      WINDOW_HOURS,
      EPSILON,
      NOW,
    );
    expect(inside.direction).toBe("steady");

    const boundary = deriveBaroTrend(
      [stored("2026-06-21T12:30:00Z", 1012), stored("2026-06-21T15:30:00Z", 1012.3)],
      WINDOW_HOURS,
      EPSILON,
      NOW,
    );
    expect(boundary.direction).toBe("steady"); // |0.3| <= 0.3
  });

  it("reports unavailable with an ETA when history is still accumulating", () => {
    const tooShort = deriveBaroTrend(
      [stored("2026-06-21T14:30:00Z", 1010), stored("2026-06-21T15:30:00Z", 1012)],
      WINDOW_HOURS,
      EPSILON,
      NOW,
    );
    // Oldest reading is only 1h old; 2h (120 min) of history still needed.
    expect(tooShort).toEqual({ direction: "unavailable", deltaHpa: null, etaMinutes: 120 });
  });

  it("estimates the full window remaining from a single fresh reading", () => {
    expect(
      deriveBaroTrend([stored("2026-06-21T15:30:00Z", 1012)], WINDOW_HOURS, EPSILON, NOW),
    ).toEqual({ direction: "unavailable", deltaHpa: null, etaMinutes: 180 });
  });

  it("reports unavailable with no ETA for an empty window", () => {
    expect(deriveBaroTrend([], WINDOW_HOURS, EPSILON, NOW)).toEqual({
      direction: "unavailable",
      deltaHpa: null,
      etaMinutes: null,
    });
  });

  it("reports unavailable with no ETA for a lone reading already older than the window", () => {
    expect(
      deriveBaroTrend([stored("2026-06-21T12:00:00Z", 1012)], WINDOW_HOURS, EPSILON, NOW),
    ).toEqual({ direction: "unavailable", deltaHpa: null, etaMinutes: null });
  });
});
