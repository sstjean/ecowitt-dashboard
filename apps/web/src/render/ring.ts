import { svgEl, el } from "./dom.ts";
import { tempGradientStops } from "./tempScale.ts";

export interface TempRing {
  /** Outer `.ring-wrap` to mount in the DOM. */
  wrap: HTMLElement;
  /** Empty `.ring-center` for the caller to populate. */
  center: HTMLElement;
}

/**
 * Build a closed full-gradient temperature ring whose stroke colour encodes the
 * value via the §5.3 scale. Shared by the outdoor and Feels Like rings so the
 * gradient + geometry live in one place (the caller fills `.ring-center`).
 */
export function buildTempRing(
  doc: Document,
  gradientId: string,
  tempF: number,
): TempRing {
  const { light, dark } = tempGradientStops(tempF);
  const gradient = svgEl(
    doc,
    "linearGradient",
    { id: gradientId, x1: "1", y1: "1", x2: "0", y2: "0" },
    svgEl(doc, "stop", { class: "g0", offset: "0", "stop-color": light }),
    svgEl(doc, "stop", { class: "g1", offset: "1", "stop-color": dark }),
  );
  const svg = svgEl(
    doc,
    "svg",
    { class: "ring full", viewBox: "0 0 200 200" },
    svgEl(doc, "defs", {}, gradient),
    svgEl(doc, "circle", { class: "track", cx: "100", cy: "100", r: "86" }),
    svgEl(doc, "circle", {
      class: "val",
      cx: "100",
      cy: "100",
      r: "86",
      stroke: `url(#${gradientId})`,
    }),
  );
  const center = el(doc, "div", { class: "ring-center" });
  const wrap = el(doc, "div", { class: "ring-wrap" }, svg, center);
  return { wrap, center };
}
