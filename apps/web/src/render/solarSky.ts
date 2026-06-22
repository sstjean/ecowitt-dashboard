import { el, svgEl } from "./dom.ts";
import { formatEasternTime } from "../format/eastern.ts";

const ARC_PATH = "M4,100 A196,86 0 0 1 396,100";
const CENTER_X = 200;
const BASELINE_Y = 100;
const DOME_HEIGHT = 86;

export interface SolarSkyData {
  solarWm2: number;
  uvIndex: number;
  sunriseUtc: string;
  sunsetUtc: string;
  /** 0–1 height along the day arc (apex at midday, 0 before sunrise / after sunset). */
  sunAltitudeFraction: number;
  /** 0–1 lunar cycle (0/1 new, 0.5 full). */
  moonPhase: number;
}

/** Name the lunar phase from its 0–1 cycle position. */
export function moonPhaseName(phase: number): string {
  if (phase < 0.0625 || phase >= 0.9375) {
    return "New Moon";
  }
  if (phase < 0.1875) {
    return "Waxing Crescent";
  }
  if (phase < 0.3125) {
    return "First Quarter";
  }
  if (phase < 0.4375) {
    return "Waxing Gibbous";
  }
  if (phase < 0.5625) {
    return "Full Moon";
  }
  if (phase < 0.6875) {
    return "Waning Gibbous";
  }
  if (phase < 0.8125) {
    return "Last Quarter";
  }
  return "Waning Crescent";
}

function readout(
  doc: Document,
  value: Node | string,
  label: string,
  extraClass = "read",
): HTMLElement {
  return el(
    doc,
    "div",
    { class: extraClass },
    el(doc, "div", { class: "v" }, value),
    el(doc, "div", { class: "l" }, label),
  );
}

/**
 * Render the Solar & Sky panel: a day-arc dome with a sun marker whose height
 * tracks `sunAltitudeFraction` (apex at midday, resting dim on the baseline
 * before sunrise / after sunset), the solar W/m² and UV readouts, the Eastern
 * sunrise/sunset times, and the named moon phase.
 */
export function renderSolarSky(container: HTMLElement, data: SolarSkyData): void {
  const doc = container.ownerDocument;

  const frac = data.sunAltitudeFraction;
  const isNight = frac <= 0;
  const cy = BASELINE_Y - DOME_HEIGHT * frac;

  const arc = svgEl(
    doc,
    "svg",
    { class: "arc-svg", viewBox: "0 0 400 110" },
    svgEl(doc, "path", {
      d: ARC_PATH, fill: "none", stroke: "var(--cp-border)",
      "stroke-width": "3", "stroke-dasharray": "2 8", "stroke-linecap": "round",
    }),
    svgEl(doc, "line", {
      x1: "4", y1: "100", x2: "396", y2: "100",
      stroke: "var(--cp-border)", "stroke-width": "1",
    }),
    svgEl(doc, "circle", {
      "data-sun-marker": "",
      cx: String(CENTER_X),
      cy: cy.toFixed(0),
      r: "9",
      fill: isNight ? "var(--cp-text-muted)" : "#ffd54a",
      opacity: isNight ? "0.35" : "1",
    }),
  );

  const moon = el(
    doc,
    "div",
    { class: "moon" },
    svgEl(
      doc,
      "svg",
      { class: "moon-icon", viewBox: "0 0 64 64", "aria-hidden": "true" },
      svgEl(doc, "circle", { cx: "32", cy: "32", r: "22", fill: "var(--cp-surface-soft)" }),
      svgEl(doc, "path", {
        d: "M32 10a22 22 0 1 0 0 44 17 17 0 0 1 0-44z", fill: "var(--cp-text-soft)",
      }),
    ),
    el(doc, "div", { class: "moon-lbl", "data-moon-phase": "" }, moonPhaseName(data.moonPhase)),
  );

  const center = el(
    doc,
    "div",
    { class: "astro-center" },
    readout(
      doc,
      el(doc, "span", {}, el(doc, "span", { "data-solar": "" }, String(data.solarWm2)), " W/m²"),
      "Solar",
    ),
    readout(
      doc,
      el(doc, "span", {}, "☼ ", el(doc, "span", { "data-uv": "" }, String(data.uvIndex))),
      "UV Index",
    ),
  );

  const sunrise = new Date(data.sunriseUtc);
  const sunset = new Date(data.sunsetUtc);
  const times = el(
    doc,
    "div",
    { class: "astro-times" },
    readout(
      doc,
      el(doc, "span", {}, "☀ ", el(doc, "span", { "data-sunrise": "" }, formatEasternTime(sunrise))),
      "Sunrise",
      "read tl",
    ),
    readout(
      doc,
      el(doc, "span", {}, el(doc, "span", { "data-sunset": "" }, formatEasternTime(sunset)), " ☾"),
      "Sunset",
      "read tr",
    ),
  );

  const wrap = el(doc, "div", { class: "arc-wrap" }, arc, moon, center, times);
  const astro = el(doc, "div", { class: "astro" }, wrap);
  const heading = el(doc, "h3", { class: "inline" }, "Solar & Sky");

  container.replaceChildren(heading, astro);
}
