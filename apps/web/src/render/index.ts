import type { LatestSnapshot } from "@ecowitt/shared";
import { deriveFreshness } from "@ecowitt/shared";
import { renderOutdoorRing } from "./outdoorRing.ts";
import { renderFeelsLikeRing } from "./feelsLikeRing.ts";
import { renderWindCompass } from "./windCompass.ts";
import { renderOutMetrics } from "./outMetrics.ts";
import { renderRainfall } from "./rainfall.ts";
import { renderSolarSky } from "./solarSky.ts";
import { renderIndoorRings } from "./indoorRings.ts";
import { renderBarometer } from "./barometer.ts";
import { renderMissingState, markPanelStale, POLL_CADENCE_SECONDS } from "./freshness.ts";
import { createHeader } from "./header.ts";

/**
 * Render the live panels from a snapshot. With no observed reading every panel
 * falls back to its Missing state (em-dash on a neutral gauge, never a `0`); the
 * wall-clock header ticks independently. When the last reading has aged past 3×
 * the poll cadence the panels keep their last values but are dimmed and stamped
 * Stale.
 */
export function renderSnapshot(snapshot: LatestSnapshot, root: HTMLElement): void {
  const reading = snapshot.reading;
  if (reading) {
    const outdoorHost = root.querySelector<HTMLElement>("[data-ring='outdoor']")!;
    const feelsHost = root.querySelector<HTMLElement>("[data-ring='feels']")!;
    const windHost = root.querySelector<HTMLElement>("[data-ring='wind']")!;
    const metricsHost = root.querySelector<HTMLElement>("[data-metrics='out']");
    const rainHost = root.querySelector<HTMLElement>("[data-panel='rain']")!;
    const solarHost = root.querySelector<HTMLElement>("[data-panel='solar']")!;
    const indoorHost = root.querySelector<HTMLElement>("[data-panel='indoor']")!;
    const baroHost = root.querySelector<HTMLElement>("[data-panel='baro']")!;
    renderOutdoorRing(outdoorHost, reading);
    renderFeelsLikeRing(feelsHost, { feelsLikeF: reading.feelsLikeF });
    renderWindCompass(windHost, reading);
    if (metricsHost) {
      renderOutMetrics(metricsHost, reading);
    }
    renderRainfall(rainHost, reading);
    renderSolarSky(solarHost, {
      solarWm2: reading.solarWm2,
      uvIndex: reading.uvIndex,
      sunriseUtc: snapshot.astro.sunriseUtc,
      sunsetUtc: snapshot.astro.sunsetUtc,
      sunAltitudeFraction: snapshot.astro.sunAltitudeFraction,
      moonPhase: snapshot.astro.moonPhase,
    });
    renderIndoorRings(indoorHost, {
      indoorTempF: reading.indoorTempF,
      indoorHumidityPct: reading.indoorHumidityPct,
    });
    renderBarometer(baroHost, {
      pressureHpa: reading.pressureHpa,
      baroTrend: snapshot.baroTrend,
      conditionIcon: snapshot.conditionIcon,
      conditionStale: snapshot.conditionStale,
    });

    // The renderers above replace each panel's children (clearing any prior
    // STALE badge); the host's own `stale` class must be cleared explicitly.
    const hosts = [outdoorHost, feelsHost, windHost, rainHost, solarHost, indoorHost, baroHost];
    if (metricsHost) {
      hosts.push(metricsHost);
    }
    for (const host of hosts) {
      host.classList.remove("stale");
    }
    const freshness = deriveFreshness(
      snapshot.observedAt,
      Date.parse(snapshot.serverTime),
      POLL_CADENCE_SECONDS,
    );
    if (freshness === "stale") {
      for (const host of hosts) {
        markPanelStale(host);
      }
    }
  } else {
    renderMissingState(root);
  }
}

export interface Dashboard {
  /** Repaint the panels from a new snapshot. */
  update(snapshot: LatestSnapshot): void;
  /** Stop the header clock. */
  stop(): void;
}

/** Mount the three-zone header (with its 1-second clock) and return an updater. */
export function mountDashboard(root: HTMLElement): Dashboard {
  const header = createHeader(root.ownerDocument);
  root.prepend(header.element);
  const stop = header.start();
  return {
    update: (snapshot) => renderSnapshot(snapshot, root),
    stop,
  };
}
