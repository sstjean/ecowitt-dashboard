import { el, svgEl } from "./dom.ts";

const CARDINALS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

/** Map a bearing in degrees to a 16-point compass label (wrapping at 360°). */
export function cardinal(deg: number): string {
  return CARDINALS[Math.round(deg / 22.5) % 16]!;
}

export interface WindData {
  windMph: number;
  windDirDeg: number;
  gustMph: number;
}

/**
 * Render the wind compass: a rim marker pointing to the bearing the wind comes
 * from, the current speed + cardinal/bearing, and the current gust. At 0 mph the
 * panel reads "Calm" with no misleading direction and no rim marker (FR-017a).
 */
/** Build the 12 evenly-spaced rim ticks (every 30°) of the compass rose. */
function buildTicks(doc: Document): SVGElement[] {
  const ticks: SVGElement[] = [];
  for (let a = 0; a < 360; a += 30) {
    const rad = ((a - 90) * Math.PI) / 180;
    ticks.push(
      svgEl(doc, "line", {
        x1: (100 + 82 * Math.cos(rad)).toFixed(1),
        y1: (100 + 82 * Math.sin(rad)).toFixed(1),
        x2: (100 + 88 * Math.cos(rad)).toFixed(1),
        y2: (100 + 88 * Math.sin(rad)).toFixed(1),
        stroke: "var(--cp-text-muted)",
        "stroke-width": "2",
      }),
    );
  }
  return ticks;
}

const LABEL_ATTRS = {
  "text-anchor": "middle",
  "font-size": "14",
  "font-weight": "600",
  fill: "var(--cp-text-soft)",
} as const;

export function renderWindCompass(container: HTMLElement, data: WindData): void {
  const doc = container.ownerDocument;
  const calm = data.windMph === 0;

  const face: SVGElement[] = [
    svgEl(doc, "circle", {
      cx: "100", cy: "100", r: "88", fill: "none",
      stroke: "var(--cp-text-muted)", "stroke-width": "2",
    }),
    ...buildTicks(doc),
    svgEl(doc, "text", { x: "100", y: "38", ...LABEL_ATTRS }, "N"),
    svgEl(doc, "text", { x: "166", y: "105", ...LABEL_ATTRS }, "E"),
    svgEl(doc, "text", { x: "100", y: "172", ...LABEL_ATTRS }, "S"),
    svgEl(doc, "text", { x: "34", y: "105", ...LABEL_ATTRS }, "W"),
  ];
  if (!calm) {
    face.push(
      svgEl(
        doc,
        "g",
        { "data-wind-needle": "", transform: `rotate(${Math.round(data.windDirDeg)} 100 100)` },
        svgEl(doc, "polygon", { points: "100,8 91,32 109,32", fill: "var(--cp-accent)" }),
        svgEl(doc, "circle", { cx: "100", cy: "40", r: "3.5", fill: "var(--cp-accent)" }),
      ),
    );
  }
  const svg = svgEl(
    doc,
    "svg",
    { class: "ring", viewBox: "0 0 200 200", style: "transform:none" },
    ...face,
  );

  const center: HTMLElement[] = [
    el(
      doc,
      "div",
      { class: "ws" },
      el(doc, "span", { "data-wind-speed": "" }, calm ? "Calm" : data.windMph.toFixed(1)),
    ),
  ];
  if (!calm) {
    center.push(
      el(
        doc,
        "div",
        { class: "wu" },
        "mph · ",
        el(doc, "span", { "data-wind-dir": "" }, cardinal(data.windDirDeg)),
        " ",
        el(doc, "span", { "data-wind-deg": "" }, String(Math.round(data.windDirDeg))),
        "°",
      ),
    );
  }
  center.push(
    el(
      doc,
      "div",
      { class: "gust" },
      "Gust ",
      el(doc, "span", { "data-wind-gust": "" }, data.gustMph.toFixed(1)),
      " mph",
    ),
  );

  const wrap = el(
    doc,
    "div",
    { class: "ring-wrap wind" },
    svg,
    el(doc, "div", { class: "wind-center" }, ...center),
  );

  container.replaceChildren(wrap);
}
