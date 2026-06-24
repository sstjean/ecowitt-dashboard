import { el } from "./dom.ts";
import { buildTempRing, buildFractionRing } from "./ring.ts";

export interface IndoorRingsData {
  indoorTempF: number;
  indoorHumidityPct: number;
}

const HUMIDITY_VIOLET = "#7c6cf0";

function gauge(doc: Document, wrap: HTMLElement, label: string): HTMLElement {
  wrap.classList.add("ind");
  return el(doc, "div", { class: "gauge lab" }, wrap, el(doc, "div", { class: "glabel" }, label));
}

/**
 * Render the two small indoor companion dials: an indoor temperature ring on
 * the shared §5.3 temperature scale and an indoor humidity ring (violet, filled
 * to the humidity fraction). De-emphasised by size, not colour.
 */
export function renderIndoorRings(container: HTMLElement, data: IndoorRingsData): void {
  const doc = container.ownerDocument;

  const temp = buildTempRing(doc, "inTempGrad", data.indoorTempF);
  temp.center.append(
    el(
      doc,
      "div",
      { class: "big" },
      el(doc, "span", { "data-in-temp": "" }, String(Math.round(data.indoorTempF))),
      el(doc, "span", { class: "unit" }, "°"),
    ),
  );

  const humidity = buildFractionRing(
    doc,
    HUMIDITY_VIOLET,
    data.indoorHumidityPct / 100,
    "data-in-hum-ring",
  );
  humidity.center.append(
    el(
      doc,
      "div",
      { class: "big" },
      el(doc, "span", { "data-in-hum": "" }, String(Math.round(data.indoorHumidityPct))),
      el(doc, "span", { class: "unit" }, "%"),
    ),
  );

  const gauges = el(
    doc,
    "div",
    { class: "out-gauges" },
    gauge(doc, temp.wrap, "Indoor Temperature"),
    gauge(doc, humidity.wrap, "Indoor Humidity"),
  );

  container.replaceChildren(gauges);
}
