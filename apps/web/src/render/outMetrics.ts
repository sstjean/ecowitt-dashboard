import { el } from "./dom.ts";
import { cardinal } from "./windCompass.ts";

export interface OutMetricsData {
  dewpointF: number;
  outdoorHumidityPct: number;
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
  unit = "",
): HTMLElement {
  return el(
    doc,
    "div",
    { class: "metric" },
    el(doc, "div", { class: "m-val" }, el(doc, "span", { [attr]: "" }, value), unit),
    el(doc, "div", { class: "m-lbl" }, label),
  );
}

/**
 * Render the outdoor card's shared metrics bar that sits below all three gauges:
 * a left group (Dewpoint, Humidity) and a right group (10-minute average wind
 * and the max daily gust), split by a vertical divider — mirroring the
 * reference console.
 */
export function renderOutMetrics(container: HTMLElement, data: OutMetricsData): void {
  const doc = container.ownerDocument;

  const left = el(
    doc,
    "div",
    { class: "mgroup" },
    metric(doc, "data-out-dew", String(Math.round(data.dewpointF)), "Dewpoint", "°"),
    metric(doc, "data-out-hum", String(Math.round(data.outdoorHumidityPct)), "Humidity", "%"),
  );
  const right = el(
    doc,
    "div",
    { class: "mgroup" },
    metric(
      doc,
      "data-wind-avg",
      `${cardinal(data.windAvg10mDirDeg)} ${data.windAvg10mMph.toFixed(1)}`,
      "10 Min Avg",
    ),
    metric(
      doc,
      "data-wind-maxgust",
      `${data.maxDailyGustDir} ${data.maxDailyGustMph.toFixed(1)}`,
      "Max Gust",
    ),
  );

  container.replaceChildren(left, el(doc, "div", { class: "divider" }), right);
}
