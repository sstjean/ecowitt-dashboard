import { el, svgEl } from "./dom.ts";
import { easternMinutesOfDay, formatEasternTime } from "../format/eastern.ts";

const ARC_PATH = "M20,100 A180,86 0 0 1 380,100";
const CENTER_X = 200;
const ARC_RADIUS_X = 180;
const BASELINE_Y = 100;
const DOME_HEIGHT = 86;

export interface SolarSkyData {
  solarWm2: number;
  uvIndex: number;
  sunriseUtc: string;
  sunsetUtc: string;
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

/**
 * SVG path for the *illuminated* portion of the moon disk (centre `c`, radius
 * `r`) at the given 0–1 phase (0/1 new, 0.25 first quarter, 0.5 full, 0.75 last).
 * The lit limb is a fixed semicircle (right while waxing, left while waning) and
 * the terminator is a half-ellipse whose width tracks the illuminated fraction,
 * collapsing to a straight line at the quarters and to the limb itself at new
 * (zero-area) / full (whole disk).
 */
export function moonLitPath(c: number, r: number, phase: number): string {
  const angle = 2 * Math.PI * phase;
  const cosA = Math.cos(angle);
  const rx = Math.abs(r * cosA).toFixed(2);
  const waxing = phase < 0.5;
  const gibbous = cosA < 0;
  const limbSweep = waxing ? 1 : 0;
  const termSweep = waxing === gibbous ? 1 : 0;
  const top = c - r;
  const bottom = c + r;
  return (
    `M${c},${top} ` +
    `A${r},${r} 0 0 ${limbSweep} ${c},${bottom} ` +
    `A${rx},${r} 0 0 ${termSweep} ${c},${top} Z`
  );
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
 * Render the Solar & Sky panel: a day-arc dome with a sun marker that walks
 * along the arc by day-progress — left at sunrise, apex at solar noon, right at
 * sunset — resting dim on the baseline overnight (FR matches the prototype),
 * the solar W/m² and UV readouts, the Eastern sunrise/sunset times, and the
 * named moon phase. `now` defaults to the live wall-clock so the sun advances
 * with each refresh.
 */
export function renderSolarSky(
  container: HTMLElement,
  data: SolarSkyData,
  now: Date = new Date(),
): void {
  const doc = container.ownerDocument;

  // Day-progress 0→1 across the daylight span (Eastern), then map onto the dome.
  const sunriseMin = easternMinutesOfDay(new Date(data.sunriseUtc));
  const sunsetMin = easternMinutesOfDay(new Date(data.sunsetUtc));
  const nowMin = easternMinutesOfDay(now);
  const frac = Math.max(0, Math.min(1, (nowMin - sunriseMin) / (sunsetMin - sunriseMin)));
  const theta = Math.PI * (1 - frac);
  const cx = CENTER_X + ARC_RADIUS_X * Math.cos(theta);
  const cy = BASELINE_Y - DOME_HEIGHT * Math.sin(theta);
  const isDay = nowMin >= sunriseMin && nowMin <= sunsetMin;

  const arc = svgEl(
    doc,
    "svg",
    { class: "arc-svg", viewBox: "0 0 400 110" },
    svgEl(doc, "path", {
      d: ARC_PATH, fill: "none", stroke: "var(--cp-border)",
      "stroke-width": "3", "stroke-dasharray": "2 8", "stroke-linecap": "round",
    }),
    svgEl(doc, "line", {
      x1: "20", y1: "100", x2: "380", y2: "100",
      stroke: "var(--cp-border)", "stroke-width": "1",
    }),
    svgEl(doc, "circle", {
      "data-sun-marker": "",
      cx: cx.toFixed(1),
      cy: cy.toFixed(1),
      r: "9",
      fill: isDay ? "#ffd54a" : "var(--cp-text-muted)",
      opacity: isDay ? "1" : "0.35",
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
        "data-moon-lit": "",
        d: moonLitPath(32, 22, data.moonPhase),
        fill: "var(--cp-text-soft)",
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
      el(
        doc,
        "span",
        {},
        el(doc, "span", { "data-solar": "" }, String(data.solarWm2)),
        el(doc, "span", { class: "u" }, " W/m²"),
      ),
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
  // Labels stay parked at the dome feet; the time values sit on the baseline,
  // pulled inward so the sun can pass them without covering the clock.
  const labels = el(
    doc,
    "div",
    { class: "astro-times" },
    el(doc, "div", { class: "read tl" }, el(doc, "div", { class: "l" }, "Sunrise")),
    el(doc, "div", { class: "read tr" }, el(doc, "div", { class: "l" }, "Sunset")),
  );
  const timeVals = el(
    doc,
    "div",
    { class: "astro-time-vals" },
    el(doc, "span", { class: "tl", "data-sunrise": "" }, formatEasternTime(sunrise)),
    el(doc, "span", { class: "tr", "data-sunset": "" }, formatEasternTime(sunset)),
  );

  const wrap = el(doc, "div", { class: "arc-wrap" }, arc, moon, center, labels, timeVals);
  const astro = el(doc, "div", { class: "astro" }, wrap);
  const heading = el(doc, "h3", { class: "inline" }, "Solar & Sky");

  container.replaceChildren(heading, astro);
}
