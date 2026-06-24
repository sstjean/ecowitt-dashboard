import { el } from "./dom.ts";
import { buildTempRing } from "./ring.ts";

export interface FeelsLikeRingData {
  feelsLikeF: number;
}

/**
 * Render the smaller Feels Like companion ring. It reuses the shared §5.3
 * temperature scale (colour encodes the apparent temperature) and is
 * de-emphasised by size rather than colour.
 */
export function renderFeelsLikeRing(
  container: HTMLElement,
  data: FeelsLikeRingData,
): void {
  const doc = container.ownerDocument;
  const { wrap, center } = buildTempRing(doc, "feelsGrad", data.feelsLikeF);
  wrap.classList.add("ind");

  center.append(
    el(
      doc,
      "div",
      { class: "big" },
      el(doc, "span", { "data-feels": "" }, String(Math.round(data.feelsLikeF))),
      el(doc, "span", { class: "unit" }, "°"),
    ),
  );

  const gauge = el(
    doc,
    "div",
    { class: "gauge lab" },
    wrap,
    el(doc, "div", { class: "glabel" }, "Feels Like"),
  );

  container.replaceChildren(gauge);
}
