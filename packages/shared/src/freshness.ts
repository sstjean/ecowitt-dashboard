export type Freshness = "fresh" | "stale" | "missing";

/**
 * Classify how current a reading is.
 *
 * - `missing` — no timestamp, or an unparseable one.
 * - `stale`   — older than 3× the poll cadence.
 * - `fresh`   — within 3× the poll cadence (future skew counts as fresh).
 */
export function deriveFreshness(
  observedAt: string | null,
  nowMs: number,
  pollCadenceSeconds: number,
): Freshness {
  if (observedAt === null) {
    return "missing";
  }
  const observedMs = Date.parse(observedAt);
  if (Number.isNaN(observedMs)) {
    return "missing";
  }
  const ageMs = nowMs - observedMs;
  const staleThresholdMs = pollCadenceSeconds * 3 * 1000;
  return ageMs > staleThresholdMs ? "stale" : "fresh";
}
