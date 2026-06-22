import type { LatestSnapshot } from "@ecowitt/shared";
import { formatEasternDate, formatEasternTime } from "../format/eastern.ts";

/**
 * Render dispatch. For now it updates the Eastern-zoned header clock from the
 * latest snapshot; per-panel renderers are layered on in the user stories.
 */
export function renderSnapshot(snapshot: LatestSnapshot, root: HTMLElement): void {
  const when = new Date(snapshot.observedAt ?? snapshot.serverTime);
  root.querySelector("[data-header-date]")!.textContent = formatEasternDate(when);
  root.querySelector("[data-header-time]")!.textContent = formatEasternTime(when);
}
