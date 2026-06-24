import type { BarometricTrend, ConditionIcon } from "@ecowitt/shared";
import { el, svgEl } from "./dom.ts";

export interface BarometerData {
  pressureHpa: number;
  baroTrend: BarometricTrend;
  conditionIcon: ConditionIcon | null;
  conditionStale: boolean;
}

const ARROW: Record<"rising" | "steady" | "falling", string> = {
  rising: "↗",
  steady: "→",
  falling: "↘",
};

/** A short glyph per sky-condition icon (placeholder for the §5 artwork). */
const CONDITION_GLYPH: Record<ConditionIcon, string> = {
  clear: "☀",
  "partly-cloudy": "⛅",
  cloudy: "☁",
  fog: "🌫",
  rainy: "🌧",
  snow: "❄",
  thunderstorm: "⛈",
  night: "🌙",
};

function buildTrend(doc: Document, trend: BarometricTrend): HTMLElement {
  if (trend.direction === "unavailable") {
    return el(
      doc,
      "div",
      { class: "baro-trend" },
      el(doc, "span", { class: "bdelta", "data-baro-unavailable": "" }, "trend unavailable"),
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
 * NWS-sourced sky-condition icon (greyed when `conditionStale`).
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
  const icon = svgEl(doc, "svg", {
    class: data.conditionStale ? "cond-icon stale" : "cond-icon",
    viewBox: "0 0 64 64",
    "data-cond-icon": data.conditionIcon ?? "",
  });
  icon.append(svgEl(doc, "text", { x: "32", y: "44", "text-anchor": "middle" }, glyph));

  const body = el(doc, "div", { class: "baro-body" }, info, icon);
  container.replaceChildren(el(doc, "h3", { class: "inline" }, "Barometer"), body);
}
