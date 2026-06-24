import { describe, it, expect, beforeEach } from "vitest";
import { renderOutMetrics } from "../../src/render/outMetrics.ts";

function host(): HTMLElement {
  document.body.innerHTML = `<div class="out-metrics" data-metrics="out"></div>`;
  return document.querySelector<HTMLElement>("[data-metrics='out']")!;
}

const sample = {
  dewpointF: 62.4,
  outdoorHumidityPct: 59,
  windAvg10mMph: 2.9,
  windAvg10mDirDeg: 121,
  maxDailyGustMph: 15.6,
  maxDailyGustDir: "NW",
};

describe("renderOutMetrics", () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = host();
  });

  it("renders Dewpoint and Humidity with their units", () => {
    renderOutMetrics(container, sample);
    expect(container.querySelector("[data-out-dew]")?.textContent).toBe("62");
    expect(container.querySelector("[data-out-hum]")?.textContent).toBe("59");
  });

  it("renders the 10-minute average and max gust as cardinal + one-decimal speed", () => {
    renderOutMetrics(container, sample);
    expect(container.querySelector("[data-wind-avg]")?.textContent).toBe("ESE 2.9");
    expect(container.querySelector("[data-wind-maxgust]")?.textContent).toBe("NW 15.6");
  });

  it("labels every metric and splits the two groups with a divider", () => {
    renderOutMetrics(container, sample);
    const labels = [...container.querySelectorAll(".m-lbl")].map((n) => n.textContent);
    expect(labels).toEqual(["Dewpoint", "Humidity", "10 Min Avg", "Max Gust"]);
    expect(container.querySelectorAll(".mgroup")).toHaveLength(2);
    expect(container.querySelector(".divider")).not.toBeNull();
  });

  it("replaces prior content when re-rendered (live update)", () => {
    renderOutMetrics(container, sample);
    renderOutMetrics(container, { ...sample, outdoorHumidityPct: 71 });
    expect(container.querySelectorAll("[data-out-hum]")).toHaveLength(1);
    expect(container.querySelector("[data-out-hum]")?.textContent).toBe("71");
  });
});
