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
  windAvg10mMph: number;
  windAvg10mDirDeg: number;
  maxDailyGustMph: number;
  maxDailyGustDir: string;
}

function metric(
  doc: Document,
  attr: string,
  value: string,
  label: string,
): HTMLElement {
  return el(
    doc,
    "div",
    { class: "metric" },
    el(doc, "div", { class: "m-val" }, el(doc, "span", { [attr]: "" }, value)),
    el(doc, "div", { class: "m-lbl" }, label),
  );
}

/**
 * Render the wind compass: a rim marker pointing to the bearing the wind comes
 * from, the current speed + cardinal/bearing, current gust, and the 10-minute
 * average and max daily gust (each speed + direction). At 0 mph the panel reads
 * "Calm" with no misleading direction and no rim marker (FR-017a).
 */
export function renderWindCompass(container: HTMLElement, data: WindData): void {
  const doc = container.ownerDocument;
  const calm = data.windMph === 0;

  const face: SVGElement[] = [
    svgEl(doc, "circle", {
      cx: "100", cy: "100", r: "88", fill: "none",
      stroke: "var(--cp-text-muted)", "stroke-width": "2",
    }),
    svgEl(doc, "text", { x: "100", y: "38", "text-anchor": "middle" }, "N"),
    svgEl(doc, "text", { x: "166", y: "105", "text-anchor": "middle" }, "E"),
    svgEl(doc, "text", { x: "100", y: "172", "text-anchor": "middle" }, "S"),
    svgEl(doc, "text", { x: "34", y: "105", "text-anchor": "middle" }, "W"),
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
  const svg = svgEl(doc, "svg", { class: "ring compass", viewBox: "0 0 200 200" }, ...face);

  const center: HTMLElement[] = [
    el(
      doc,
      "div",
      { class: "ws" },
      el(doc, "span", { "data-wind-speed": "" }, calm ? "Calm" : String(Math.round(data.windMph))),
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
      el(doc, "span", { "data-wind-gust": "" }, String(Math.round(data.gustMph))),
    ),
  );

  const wrap = el(
    doc,
    "div",
    { class: "ring-wrap wind" },
    svg,
    el(doc, "div", { class: "wind-center" }, ...center),
  );

  const metrics = el(
    doc,
    "div",
    { class: "wind-metrics" },
    metric(
      doc,
      "data-wind-avg",
      `${Math.round(data.windAvg10mMph)} mph ${cardinal(data.windAvg10mDirDeg)}`,
      "10 Min Avg",
    ),
    metric(
      doc,
      "data-wind-maxgust",
      `${Math.round(data.maxDailyGustMph)} mph ${data.maxDailyGustDir}`,
      "Max Gust",
    ),
  );

  container.replaceChildren(wrap, metrics);
}
