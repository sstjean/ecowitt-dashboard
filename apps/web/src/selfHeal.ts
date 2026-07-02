/**
 * Self-heal on deploy (US1): compare the build id baked into the running bundle
 * with the id published in `/version.json`, and reload the page exactly once on a
 * genuine change. Split into a pure decision (`decideReload`) and a thin effectful
 * runner (`checkForUpdate`) so the decision table is trivially 100%-covered (SRP).
 */

export interface CheckForUpdateDeps {
  /** Injected fetch so tests need no real network. */
  fetchImpl: typeof fetch;
  /** Injected page reload so tests need no real navigation. */
  reload: () => void;
  /** The build id baked into the running bundle (`__BUILD_ID__`). */
  getRunning: () => string;
}

/**
 * Pure reload decision. Returns `true` ONLY when the served id is a non-null,
 * non-blank string that differs from the running id. Null / blank / equal →
 * `false` (an unknown or matching id is never treated as "changed").
 */
export function decideReload(
  runningId: string,
  servedId: string | null,
): boolean {
  if (servedId === null || servedId.trim() === "") {
    return false;
  }
  return servedId !== runningId;
}

/** Module-level latch: reload at most once per page lifetime (loop guard). */
let hasReloaded = false;

/**
 * Fetch `/version.json` (no-store), parse its `buildId`, and reload once on a
 * genuine change. Any fetch/parse failure resolves to `null` ("unknown"), which
 * never triggers a reload. The `hasReloaded` latch guarantees a single reload
 * even if the served id keeps differing (FR-007, FR-009, FR-010).
 */
export async function checkForUpdate({
  fetchImpl,
  reload,
  getRunning,
}: CheckForUpdateDeps): Promise<void> {
  const servedId = await fetchServedId(fetchImpl);
  if (!hasReloaded && decideReload(getRunning(), servedId)) {
    hasReloaded = true;
    reload();
  }
}

async function fetchServedId(fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchImpl("/version.json", { cache: "no-store" });
    if (!res.ok) {
      return null;
    }
    const body: unknown = await res.json();
    const buildId = (body as { buildId?: unknown }).buildId;
    return typeof buildId === "string" ? buildId : null;
  } catch {
    return null;
  }
}
