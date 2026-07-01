import { el, svgEl } from "./dom.ts";
import { hexToRgb, rgbToCss } from "./tempScale.ts";

/**
 * Engineered full-scale cap for the droplet fill, in inches. Anchored to local
 * extremes (2025 wettest day 3.65 in; Jun-20 calendar-day record 2.00 in) and
 * agreed at 4 in. Beyond the cap the droplet stays full and its colour
 * escalates to signal an extreme rain day.
 */
export const RAIN_FULL_SCALE_IN = 4.0;

const DROP_PATH = "M50,8 C50,8 14,56 14,84 a36,36 0 0 0 72,0 C86,56 50,8 50,8 Z";
const FILL_TOP = 8;
const FILL_BOTTOM = 120;

/** Daily-total fill fraction of the droplet, clamped to [0,1] against the cap. */
export function dropFillFraction(dailyIn: number, fullScaleIn: number): number {
  return Math.max(0, Math.min(1, dailyIn / fullScaleIn));
}

function lerpHex(from: string, to: string, f: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToCss([
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ]);
}

/** Droplet colour: base blue up to the cap, escalating blue → amber → red beyond it. */
export function rainDropColor(dailyIn: number, fullScaleIn: number): string {
  if (dailyIn <= fullScaleIn) {
    return "#4da6ff";
  }
  const over = Math.min(1, (dailyIn - fullScaleIn) / fullScaleIn);
  return over <= 0.5
    ? lerpHex("#4da6ff", "#ff9800", over / 0.5)
    : lerpHex("#ff9800", "#d32f2f", (over - 0.5) / 0.5);
}

export interface RainData {
  rainDailyIn: number;
  rainRateInHr: number;
  rainEventIn: number;
  rainHourlyIn: number;
  rainWeeklyIn: number;
  rainMonthlyIn: number;
  rainYearlyIn: number;
  isRaining: boolean;
  /** True when the gauge is suspected of not measuring during a storm signature. */
  rainSensorSuspect: boolean;
  /** Human-readable reason for the suspected fault, or null when not suspect. */
  rainSensorReason: string | null;
}

function totalRow(
  doc: Document,
  label: string,
  attr: string,
  valueIn: number,
): HTMLElement {
  return el(
    doc,
    "div",
    { class: "rr" },
    el(doc, "span", {}, label),
    el(doc, "span", { [attr]: "" }, `${valueIn.toFixed(2)} in`),
  );
}

/**
 * The pulsing "Raining now" cue. It lives inside the middle column directly
 * above the Daily Rain value, so its only layout effect is to push Daily Rain +
 * label down — it never grows the card or moves the droplet/totals.
 */
function buildRainingBanner(doc: Document): HTMLElement {
  return el(
    doc,
    "div",
    { class: "rain-now-banner", "data-rain-now": "", role: "status" },
    el(doc, "span", { class: "dot", "aria-hidden": "true" }),
    el(doc, "span", { class: "rain-now-text" }, "Raining now"),
  );
}

/**
 * The suspected-fault overlay. It is absolutely positioned to cover the whole
 * card, centered on both axes, and dims the card content behind it. It carries
 * no timestamp, so the Eastern-time / no-UTC rule (FR-011) is satisfied by
 * construction. A `null`/missing reason renders an empty reason line rather
 * than crashing.
 */
function buildFaultOverlay(doc: Document, reason: string): HTMLElement {
  return el(
    doc,
    "div",
    { class: "rain-fault-overlay", "data-rain-fault": "", role: "status" },
    el(doc, "span", { class: "rain-fault-icon", "aria-hidden": "true" }, "⚠"),
    el(
      doc,
      "div",
      { class: "rain-fault-text" },
      el(doc, "span", { class: "rain-fault-title" }, "Sensor may not be reporting"),
      el(
        doc,
        "span",
        { class: "rain-fault-reason", "data-rain-fault-reason": "" },
        reason,
      ),
    ),
  );
}

/**
 * Render the rainfall panel: a droplet that fills proportionally to the daily
 * total (full-scale {@link RAIN_FULL_SCALE_IN}, colour-escalating above the
 * cap), the six running totals (Daily most prominent), the rain rate, and a
 * "raining now" badge driven by the piezo flag.
 */
export function renderRainfall(container: HTMLElement, data: RainData): void {
  const doc = container.ownerDocument;

  const frac = dropFillFraction(data.rainDailyIn, RAIN_FULL_SCALE_IN);
  const height = (FILL_BOTTOM - FILL_TOP) * frac;

  const badge = buildRainingBanner(doc);
  // A suspected gauge fault can't be trusted to be "raining now" either, so the
  // banner is suppressed whenever the gauge is dry OR suspect.
  if (!data.isRaining || data.rainSensorSuspect) {
    badge.setAttribute("hidden", "");
  }

  const heading = el(doc, "h3", { class: "inline" }, "Rainfall");

  // A distinct, kiosk-legible warning (Feature 004), announced to assistive tech,
  // shown only when the gauge is suspected of not measuring (FR-009). It dims the
  // card content behind it and carries no timestamp.
  const fault = data.rainSensorSuspect
    ? buildFaultOverlay(doc, data.rainSensorReason ?? "")
    : null;

  const droplet = el(
    doc,
    "div",
    { class: "drop-wrap" },
    svgEl(
      doc,
      "svg",
      { class: "drop-svg", viewBox: "0 0 100 130" },
      svgEl(
        doc,
        "clipPath",
        { id: "dropClip" },
        svgEl(doc, "path", { d: DROP_PATH }),
      ),
      svgEl(
        doc,
        "g",
        { "clip-path": "url(#dropClip)" },
        svgEl(doc, "rect", {
          x: "0", y: "0", width: "100", height: "130",
          fill: "var(--cp-surface-soft)",
        }),
        svgEl(doc, "rect", {
          "data-drop-fill": "",
          x: "0",
          y: String(FILL_BOTTOM - height),
          width: "100",
          height: String(height),
          fill: rainDropColor(data.rainDailyIn, RAIN_FULL_SCALE_IN),
        }),
      ),
      svgEl(doc, "path", {
        d: DROP_PATH, fill: "none",
        stroke: "var(--cp-outline)", "stroke-width": "3",
      }),
    ),
  );

  const main = el(
    doc,
    "div",
    { class: "rain-main" },
    badge,
    el(
      doc,
      "div",
      { class: "rv" },
      el(doc, "span", { "data-rain-daily": "" }, data.rainDailyIn.toFixed(2)),
      el(doc, "span", { class: "u" }, " in"),
    ),
    el(doc, "div", { class: "rl" }, "Daily Rain"),
    el(
      doc,
      "div",
      { class: "rain-rate" },
      el(doc, "span", { class: "rrv", "data-rain-rate": "" }, data.rainRateInHr.toFixed(2)),
      " in/hr",
    ),
  );

  const grid = el(
    doc,
    "div",
    { class: "rain-grid" },
    totalRow(doc, "Event", "data-rain-event", data.rainEventIn),
    totalRow(doc, "Hourly", "data-rain-hourly", data.rainHourlyIn),
    totalRow(doc, "Weekly", "data-rain-weekly", data.rainWeeklyIn),
    totalRow(doc, "Monthly", "data-rain-monthly", data.rainMonthlyIn),
    totalRow(doc, "Yearly", "data-rain-yearly", data.rainYearlyIn),
  );

  const body = el(doc, "div", { class: "rain-body" }, droplet, main, grid);
  if (data.rainSensorSuspect) {
    body.classList.add("dimmed");
  }

  // The overlay is the LAST card child so it stacks above the dimmed body; the
  // `.card` is already `position: relative; overflow: hidden`.
  const banners = fault ? [heading, body, fault] : [heading, body];
  container.replaceChildren(...banners);
}
