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
import { createSensorHealthPage } from "./sensorHealthPage.ts";
import { buildSensorIndicator } from "./sensorIndicator.ts";
import { createReconnectingCue } from "./reconnecting.ts";
import { sensorCardMap } from "../sensorCardMap.ts";

/**
 * Attach the per-card signal + battery indicator (US2) to each sensor-backed
 * card via the static {@link sensorCardMap}. All WS90-backed cards resolve to
 * the single WS90 record; wired wh25 cards get an N/A/no-radio indicator. A
 * stale/unavailable envelope degrades every indicator to an honest `Unknown`
 * (never fabricated bars or "0%"). Runs after the panel renderers so the
 * indicator survives their child replacement.
 */
function attachCardIndicators(root: HTMLElement, health: LatestSnapshot["sensorHealth"]): void {
  const doc = root.ownerDocument;
  const stale = health.stale || !health.available;
  for (const binding of sensorCardMap) {
    const card = root.querySelector<HTMLElement>(`[data-panel="${binding.panel}"]`);
    if (!card) {
      continue;
    }
    const sensor = stale
      ? null
      : health.sensors.find((s) => s.id === binding.sensorId) ?? null;
    const indicator = buildSensorIndicator(doc, sensor, { radio: binding.radio });
    const existing = card.querySelector<HTMLElement>(":scope > .sensor-indicator");
    if (existing) {
      existing.replaceWith(indicator);
    } else {
      card.append(indicator);
    }
  }
}

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
    renderRainfall(rainHost, {
      ...reading,
      rainSensorSuspect: snapshot.rainSensorSuspect,
      rainSensorReason: snapshot.rainSensorReason,
    });
    renderSolarSky(solarHost, {
      solarWm2: reading.solarWm2,
      uvIndex: reading.uvIndex,
      sunriseUtc: snapshot.astro.sunriseUtc,
      sunsetUtc: snapshot.astro.sunsetUtc,
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
      conditionText: snapshot.conditionText,
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
  // The per-card sensor indicators (US2) attach last so they survive the panel
  // renderers' child replacement, in both the reading and missing branches.
  attachCardIndicators(root, snapshot.sensorHealth);
}

export interface Dashboard {
  /** Repaint the panels from a new snapshot. */
  update(snapshot: LatestSnapshot): void;
  /** Stop the header clock. */
  stop(): void;
  /**
   * Show (`true`) / hide (`false`) the subtle header "reconnecting" cue (013 US1).
   * Delegates to the header-mounted cue; never touches panel values.
   */
  setReconnecting(active: boolean): void;
}

/** Mount the three-zone header (with its 1-second clock) and return an updater. */
export function mountDashboard(root: HTMLElement): Dashboard {
  const health = createSensorHealthPage(root.ownerDocument);
  const header = createHeader(root.ownerDocument, { onSensors: () => health.toggle() });
  const reconnecting = createReconnectingCue(root.ownerDocument);
  header.element.append(reconnecting.element);
  root.prepend(header.element);
  root.append(health.element);
  const stop = header.start();
  return {
    update: (snapshot) => {
      renderSnapshot(snapshot, root);
      health.update(snapshot.sensorHealth);
    },
    stop,
    setReconnecting: (active) => reconnecting.set(active),
  };
}
