import type { LatestSnapshot } from "@ecowitt/shared";
import { renderOutdoorRing } from "./outdoorRing.ts";
import { renderFeelsLikeRing } from "./feelsLikeRing.ts";
import { createHeader } from "./header.ts";

/**
 * Render the live panels from a snapshot. When there is no observed reading the
 * temperature hosts are cleared; the wall-clock header ticks independently.
 */
export function renderSnapshot(snapshot: LatestSnapshot, root: HTMLElement): void {
  const outdoorHost = root.querySelector<HTMLElement>("[data-ring='outdoor']")!;
  const feelsHost = root.querySelector<HTMLElement>("[data-ring='feels']")!;
  const reading = snapshot.reading;
  if (reading) {
    renderOutdoorRing(outdoorHost, reading);
    renderFeelsLikeRing(feelsHost, { feelsLikeF: reading.feelsLikeF });
  } else {
    outdoorHost.replaceChildren();
    feelsHost.replaceChildren();
  }
}

export interface Dashboard {
  /** Repaint the panels from a new snapshot. */
  update(snapshot: LatestSnapshot): void;
  /** Stop the header clock. */
  stop(): void;
}

/** Mount the three-zone header (with its 1-second clock) and return an updater. */
export function mountDashboard(root: HTMLElement): Dashboard {
  const header = createHeader(root.ownerDocument);
  root.prepend(header.element);
  const stop = header.start();
  return {
    update: (snapshot) => renderSnapshot(snapshot, root),
    stop,
  };
}
