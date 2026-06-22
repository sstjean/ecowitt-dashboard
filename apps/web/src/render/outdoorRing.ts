import { el } from "./dom.ts";
import { buildTempRing } from "./ring.ts";

export interface OutdoorRingData {
  outdoorTempF: number;
  dayHighF: number;
  dayLowF: number;
  feelsLikeF: number;
  dewpointF: number;
  outdoorHumidityPct: number;
}

function metric(
  doc: Document,
  attr: string,
  value: string,
  unit: string,
  label: string,
): HTMLElement {
  const span = el(doc, "span", { [attr]: "" }, value);
  return el(
    doc,
    "div",
    { class: "metric" },
    el(doc, "div", { class: "m-val" }, span, unit),
    el(doc, "div", { class: "m-lbl" }, label),
  );
}

/** Render the headline outdoor temperature ring plus supporting readouts. */
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

  const readouts = el(
    doc,
    "div",
    { class: "out-readouts" },
    metric(doc, "data-out-feels", String(Math.round(data.feelsLikeF)), "°", "Feels Like"),
    metric(doc, "data-out-dew", String(Math.round(data.dewpointF)), "°", "Dewpoint"),
    metric(doc, "data-out-hum", String(Math.round(data.outdoorHumidityPct)), "%", "Humidity"),
  );

  container.replaceChildren(wrap, readouts);
}
