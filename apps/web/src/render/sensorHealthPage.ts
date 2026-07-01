import type { SensorHealth, SensorHealthEntry } from "@ecowitt/shared";
import { el } from "./dom.ts";
import { buildSignalBars, buildBatteryBadge } from "./sensorIndicator.ts";
import { formatEasternDateTime } from "../format/eastern.ts";

export interface SensorHealthPageHandle {
  /** The overlay element to mount — hidden by default (kiosk default intact). */
  element: HTMLElement;
  /** Re-render the fleet from a fresh `sensorHealth` envelope object. */
  update(health: SensorHealth): void;
  /** Reveal the overlay. */
  show(): void;
  /** Hide the overlay. */
  hide(): void;
  /** Flip the overlay's visibility. */
  toggle(): void;
}

/** Build one sensor row. When `stale`, present an honest Unknown state (never
 *  aged battery/signal values shown as if current — FR-013). */
function buildRow(doc: Document, sensor: SensorHealthEntry, stale: boolean): HTMLElement {
  const battery = stale ? "Unknown" : sensor.battery;
  const bars = stale ? null : sensor.signalBars;

  const name = el(
    doc,
    "span",
    { class: "sh-name" },
    sensor.name,
    el(doc, "span", { class: "sh-model" }, sensor.img),
  );

  const signal = el(doc, "span", { class: "sh-signal" }, buildSignalBars(doc, bars));
  if (!stale && sensor.rssiDbm !== null) {
    signal.append(el(doc, "span", { class: "sh-rssi" }, `${sensor.rssiDbm} dBm`));
  }

  const lastSeen = el(
    doc,
    "span",
    { class: "sh-lastseen" },
    formatEasternDateTime(new Date(sensor.lastSeenUtc)),
  );
  if (stale) {
    lastSeen.append(el(doc, "span", { class: "sh-stale-tag" }, "STALE"));
  }

  const attrs = stale ? { class: "sh-row sh-row--stale" } : { class: "sh-row" };
  return el(
    doc,
    "li",
    { ...attrs, "data-sensor-id": sensor.id },
    name,
    el(doc, "span", { class: "sh-batt" }, buildBatteryBadge(doc, battery)),
    signal,
    lastSeen,
  );
}

/**
 * The dedicated Sensor Health overlay (US3). Hidden by default so the single
 * viewport kiosk layout is byte-for-byte unchanged; revealed via the header's
 * "Sensors" item. Lists every registered sensor with name/model, battery,
 * signal + rssi, and Eastern last-seen. A stale/unavailable envelope degrades
 * honestly to Unknown (never fabricated bars or "0%").
 */
export function createSensorHealthPage(doc: Document): SensorHealthPageHandle {
  const list = el(doc, "ul", { class: "sh-list" });
  const close = el(doc, "button", { class: "sh-close", "aria-label": "Close" }, "✕");
  const panel = el(
    doc,
    "div",
    { class: "sh-panel" },
    el(
      doc,
      "div",
      { class: "sh-head" },
      el(doc, "span", { class: "sh-title" }, "Sensor Health"),
      close,
    ),
    list,
  );
  const element = el(
    doc,
    "div",
    { class: "sensor-health-overlay", hidden: "", "data-sensor-health-overlay": "" },
    panel,
  );

  function hide(): void {
    element.hidden = true;
  }
  function show(): void {
    element.hidden = false;
  }
  function toggle(): void {
    element.hidden = !element.hidden;
  }
  close.addEventListener("click", hide);

  function update(health: SensorHealth): void {
    const stale = health.stale || !health.available;
    if (health.sensors.length === 0) {
      list.replaceChildren(
        el(doc, "li", { class: "sh-empty" }, "No sensor health available (Unknown)."),
      );
      return;
    }
    list.replaceChildren(...health.sensors.map((s) => buildRow(doc, s, stale)));
  }

  return { element, update, show, hide, toggle };
}
