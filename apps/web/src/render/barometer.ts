import type { BarometricTrend, ConditionIcon } from "@ecowitt/shared";
import { el } from "./dom.ts";

export interface BarometerData {
  pressureHpa: number;
  baroTrend: BarometricTrend;
  conditionIcon: ConditionIcon | null;
  conditionStale: boolean;
  /** Verbatim NWS label (e.g. "Partly Sunny"); null falls back to a derived label. */
  conditionText: string | null;
}

const ARROW: Record<"rising" | "steady" | "falling", string> = {
  rising: "↗",
  steady: "→",
  falling: "↘",
};

/**
 * A color-emoji glyph per sky-condition icon. The variation selector (U+FE0F)
 * forces emoji presentation so the symbols render in full color rather than as
 * a monochrome (black) text glyph.
 */
const CONDITION_GLYPH: Record<ConditionIcon, string> = {
  clear: "\u2600\uFE0F",
  "partly-cloudy": "\u26C5",
  cloudy: "\u2601\uFE0F",
  fog: "\uD83C\uDF2B\uFE0F",
  rainy: "\uD83C\uDF27\uFE0F",
  snow: "\u2744\uFE0F",
  thunderstorm: "\u26C8\uFE0F",
  night: "\uD83C\uDF19",
};

/** A human-readable fallback label per icon when NWS text is unavailable. */
const CONDITION_LABEL: Record<ConditionIcon, string> = {
  clear: "Clear",
  "partly-cloudy": "Partly Cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  rainy: "Rain",
  snow: "Snow",
  thunderstorm: "Thunderstorms",
  night: "Clear",
};

function buildTrend(doc: Document, trend: BarometricTrend): HTMLElement {
  if (trend.direction === "unavailable") {
    const message =
      trend.etaMinutes === null
        ? "trend unavailable"
        : `Trend available in ${trend.etaMinutes} ${
            trend.etaMinutes === 1 ? "minute" : "minutes"
          }.`;
    return el(
      doc,
      "div",
      { class: "baro-trend" },
      el(doc, "span", { class: "bdelta", "data-baro-unavailable": "" }, message),
    );
  }
  return el(
    doc,
    "div",
    { class: "baro-trend" },
    el(
      doc,
      "span",
      { class: `baro-arrow ${trend.direction}`, "data-baro-trend": "" },
      ARROW[trend.direction],
    ),
    el(
      doc,
      "span",
      { class: "bdelta" },
      el(doc, "span", { "data-baro-delta": "" }, trend.deltaHpa!.toFixed(1)),
      " hPa/3h",
    ),
  );
}

/**
 * Render the barometer panel: absolute pressure, the 3-hour trend (arrow + delta
 * or an honest "trend unavailable" state with <3 h of history), and the
 * NWS-sourced sky-condition icon plus its label (greyed when `conditionStale`).
 */
export function renderBarometer(container: HTMLElement, data: BarometerData): void {
  const doc = container.ownerDocument;

  const press = el(
    doc,
    "div",
    { class: "baro-press" },
    el(
      doc,
      "span",
      { class: "bunits" },
      el(doc, "span", { class: "bcaption" }, "ABS"),
      el(doc, "span", { class: "bcaption bunit" }, "hPa"),
    ),
    el(
      doc,
      "span",
      { class: "bv" },
      el(doc, "span", { "data-press": "" }, data.pressureHpa.toFixed(1)),
    ),
  );

  const info = el(doc, "div", { class: "baro-info" }, press, buildTrend(doc, data.baroTrend));

  const glyph = data.conditionIcon === null ? "—" : CONDITION_GLYPH[data.conditionIcon];
  const label =
    data.conditionText ??
    (data.conditionIcon === null ? "—" : CONDITION_LABEL[data.conditionIcon]);
  const icon = el(
    doc,
    "div",
    {
      class: data.conditionStale ? "cond-icon stale" : "cond-icon",
      "data-cond-icon": data.conditionIcon ?? "",
    },
    el(doc, "span", { class: "cond-glyph", "aria-hidden": "true" }, glyph),
    el(doc, "span", { class: "cond-label", "data-cond-label": "" }, label),
  );

  const body = el(doc, "div", { class: "baro-body" }, info, icon);
  container.replaceChildren(el(doc, "h3", { class: "inline" }, "Barometer"), body);
}
