import { el } from "./dom.ts";

/**
 * A subtle "reconnecting" cue (013 US1): a quiet `--cp-warning` dot plus a fixed
 * "Reconnecting…" label, hidden by default. It renders the edge-triggered
 * reconnect signal from the poll loop via {@link ReconnectingCue.set}. Toggling
 * mutates ONLY this element — never a panel node (FR-004) — and is idempotent, so
 * a persistent outage neither re-inserts the node nor restarts the pulse
 * (FR-005). The cue shows no timestamp (FR-009).
 */
export interface ReconnectingCue {
  /** The cue element to insert into the header status area. */
  element: HTMLElement;
  /** Show (`true`) / hide (`false`) the cue. Idempotent — a no-op when unchanged. */
  set(active: boolean): void;
}

/** Build a hidden reconnecting cue. `set(true)` reveals it; `set(false)` hides it. */
export function createReconnectingCue(doc: Document): ReconnectingCue {
  const dot = el(doc, "span", { class: "rc-dot", "aria-hidden": "true" });
  const label = el(doc, "span", { class: "rc-label" }, "Reconnecting…");
  const element = el(doc, "div", { class: "reconnecting-cue", role: "status" }, dot, label);
  element.hidden = true;

  let active = false;
  return {
    element,
    set(next: boolean): void {
      if (next === active) {
        return;
      }
      active = next;
      element.hidden = !next;
    },
  };
}
