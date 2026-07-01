import type { SensorHealthEntry } from "@ecowitt/shared";
import { el } from "./dom.ts";

type Battery = SensorHealthEntry["battery"];

/** Distinct, honest cues per battery status — never a numeric "0%" for a flag/wired sensor. */
const BATTERY_LABELS: Record<Battery, { cls: string; text: string }> = {
  OK: { cls: "batt-ok", text: "OK" },
  Low: { cls: "batt-low", text: "Low" },
  Unknown: { cls: "batt-unknown", text: "Unknown" },
  "N/A": { cls: "batt-na", text: "N/A" },
};

/**
 * A four-bar RF-signal strip. `bars` is a 0–4 count; `null` renders an explicit
 * **no-radio** state (a dash), never an empty four-bar strip that could misread
 * as a live "0 of 4 / lost signal" (FR-009).
 */
export function buildSignalBars(doc: Document, bars: number | null): HTMLElement {
  if (bars === null) {
    return el(
      doc,
      "span",
      { class: "sig-bars sig-bars--na", "data-signal-bars": "na", "aria-label": "no radio" },
      "—",
    );
  }
  const strip = el(doc, "span", { class: "sig-bars", "data-signal-bars": String(bars) });
  for (let i = 1; i <= 4; i += 1) {
    strip.append(el(doc, "span", { class: `sig-bar ${i <= bars ? "on" : "off"}` }));
  }
  return strip;
}

/** A battery status badge. The rendered value is the enum cue, never a raw "0%". */
export function buildBatteryBadge(doc: Document, status: Battery): HTMLElement {
  const { cls, text } = BATTERY_LABELS[status];
  return el(doc, "span", { class: `batt-badge ${cls}`, "data-battery": status }, text);
}

/** Options for a per-card indicator. */
export interface SensorIndicatorOptions {
  /** Whether to show the radio signal strip (false for wired sensors → no strip). */
  radio: boolean;
}

/**
 * A small per-card indicator combining the shared signal + battery primitives
 * (SRP+DRY — the same builders the health page consumes). A `null` entry is the
 * honest degradation state (stale/unavailable): `Unknown` battery and a no-radio
 * strip, never fabricated bars or a "0%" (FR-013).
 */
export function buildSensorIndicator(
  doc: Document,
  entry: SensorHealthEntry | null,
  opts: SensorIndicatorOptions,
): HTMLElement {
  const box = el(doc, "div", {
    class: "sensor-indicator",
    "data-sensor-indicator": entry?.id ?? "unknown",
  });
  const battery: Battery = entry ? entry.battery : "Unknown";
  if (opts.radio) {
    box.append(buildSignalBars(doc, entry ? entry.signalBars : null));
  }
  box.append(buildBatteryBadge(doc, battery));
  return box;
}
