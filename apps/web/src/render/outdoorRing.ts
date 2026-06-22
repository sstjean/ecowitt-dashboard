import { el } from "./dom.ts";
import { buildTempRing } from "./ring.ts";

export interface OutdoorRingData {
  outdoorTempF: number;
  dayHighF: number;
  dayLowF: number;
}

/** Render the headline outdoor temperature ring with its day high/low marks. */
export function renderOutdoorRing(
  container: HTMLElement,
  data: OutdoorRingData,
): void {
  const doc = container.ownerDocument;
  const { wrap, center } = buildTempRing(doc, "outTempGrad", data.outdoorTempF);

  center.append(
    el(
      doc,
      "div",
      { class: "big" },
      el(doc, "span", { "data-out-temp": "" }, String(Math.round(data.outdoorTempF))),
      el(doc, "span", { class: "unit" }, "°"),
    ),
    el(
      doc,
      "div",
      { class: "hl" },
      el(
        doc,
        "span",
        { class: "up" },
        "↑",
        el(doc, "span", { "data-out-hi": "" }, String(Math.round(data.dayHighF))),
        "°",
      ),
      "\u00a0",
      el(
        doc,
        "span",
        { class: "dn" },
        "↓",
        el(doc, "span", { "data-out-lo": "" }, String(Math.round(data.dayLowF))),
        "°",
      ),
    ),
  );

  container.replaceChildren(wrap);
}
