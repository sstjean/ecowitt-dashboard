import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { LatestSnapshot, LiveReadingSnapshot } from "@ecowitt/shared";
import { renderSnapshot, mountDashboard } from "../../src/render/index.ts";

function shell(): HTMLElement {
  document.body.innerHTML = `
    <div id="app">
      <main>
        <div class="gauge" data-ring="outdoor"></div>
        <div data-ring="feels"></div>
        <div data-ring="wind"></div>
        <div class="out-metrics" data-metrics="out"></div>
        <section data-panel="rain"></section>
        <section data-panel="solar"></section>
        <section data-panel="indoor"></section>
        <section data-panel="baro"></section>
      </main>
    </div>`;
  return document.getElementById("app")!;
}

const astro = {
  sunriseUtc: "2026-06-21T09:25:00Z",
  sunsetUtc: "2026-06-22T00:31:00Z",
  sunAltitudeFraction: 0.58,
  moonPhase: 0.21,
};

function reading(overrides: Partial<LiveReadingSnapshot> = {}): LiveReadingSnapshot {
  return {
    observedAt: "2026-06-19T22:05:00Z",
    outdoorTempF: 72.4,
    feelsLikeF: 70.9,
    dewpointF: 55.5,
    outdoorHumidityPct: 64,
    dayHighF: 81.6,
    dayLowF: 58.2,
    windMph: 4.1,
    windDirDeg: 210,
    gustMph: 9.2,
    windAvg10mMph: 3.6,
    windAvg10mDirDeg: 205,
    maxDailyGustMph: 18.4,
    maxDailyGustDir: "SW",
    solarWm2: 612,
    uvIndex: 5,
    indoorTempF: 70.2,
    indoorHumidityPct: 48,
    rainEventIn: 0,
    rainHourlyIn: 0,
    rainDailyIn: 0,
    rainWeeklyIn: 0,
    rainMonthlyIn: 0,
    rainYearlyIn: 0,
    rainRateInHr: 0,
    isRaining: false,
    pressureHpa: 1016.2,
    ...overrides,
  };
}

function okSnap(r: LiveReadingSnapshot = reading()): LatestSnapshot {
  return {
    status: "ok",
    observedAt: r.observedAt,
    serverTime: "2026-06-19T22:05:07Z",
    reading: r,
    astro,
    baroTrend: { direction: "steady", deltaHpa: 0, etaMinutes: null },
    conditionIcon: "clear",
    conditionStale: false,
    conditionText: "Sunny",
    rainSensorSuspect: false,
    rainSensorReason: null,
    sensorHealth: { available: false, stale: true, capturedAtUtc: null, sensors: [] },
  };
}

function noDataSnap(): LatestSnapshot {
  return {
    status: "no-data",
    observedAt: null,
    serverTime: "2026-01-15T22:05:07Z",
    reading: null,
    astro,
    baroTrend: { direction: "unavailable", deltaHpa: null, etaMinutes: null },
    conditionIcon: null,
    conditionStale: true,
    conditionText: null,
    rainSensorSuspect: false,
    rainSensorReason: null,
    sensorHealth: { available: false, stale: true, capturedAtUtc: null, sensors: [] },
  };
}

let root: HTMLElement;
beforeEach(() => {
  root = shell();
});

describe("renderSnapshot", () => {
  it("renders the outdoor + feels-like rings from the reading", () => {
    renderSnapshot(okSnap(), root);
    expect(root.querySelector("[data-out-temp]")?.textContent).toBe("72");
    expect(root.querySelector("[data-feels]")?.textContent).toBe("71");
  });

  it("fills the shared outdoor metrics bar when its host is present", () => {
    renderSnapshot(okSnap(), root);
    expect(root.querySelector("[data-out-dew]")?.textContent).toBe("56");
    expect(root.querySelector("[data-out-hum]")?.textContent).toBe("64");
    expect(root.querySelector("[data-wind-avg]")?.textContent).toBe("SSW 3.6");
    expect(root.querySelector("[data-wind-maxgust]")?.textContent).toBe("SW 18.4");
  });

  it("renders the Missing state on the hosts when there is no reading", () => {
    renderSnapshot(okSnap(), root);
    renderSnapshot(noDataSnap(), root);
    expect(root.querySelector("[data-ring='outdoor']")?.textContent).toContain("—");
    expect(root.querySelector("[data-ring='feels']")?.textContent).toContain("—");
    expect(root.querySelector("[data-ring='outdoor'] .ring.missing")).not.toBeNull();
  });

  it("plumbs the envelope's rainSensorSuspect/rainSensorReason into the rainfall card (SC-006)", () => {
    const reason = "Storm signature with no rain measured (gust spike, pressure dip)";
    const snap = okSnap(reading({ rainDailyIn: 0, rainRateInHr: 0, isRaining: false }));
    snap.rainSensorSuspect = true;
    snap.rainSensorReason = reason;
    renderSnapshot(snap, root);
    const fault = root.querySelector("[data-panel='rain'] [data-rain-fault]");
    expect(fault).not.toBeNull();
    expect(fault?.classList.contains("rain-fault-overlay")).toBe(true);
    expect(
      root.querySelector("[data-panel='rain'] [data-rain-fault-reason]")?.textContent,
    ).toBe(reason);
    // The card body behind the overlay is dimmed.
    expect(
      root.querySelector("[data-panel='rain'] .rain-body")?.classList.contains("dimmed"),
    ).toBe(true);
  });

  it("shows no fault indicator on the rainfall card when the envelope is not suspect", () => {
    renderSnapshot(okSnap(reading({ rainDailyIn: 0, isRaining: false })), root);
    expect(root.querySelector("[data-panel='rain'] [data-rain-fault]")).toBeNull();
    expect(
      root.querySelector("[data-panel='rain'] .rain-body")?.classList.contains("dimmed"),
    ).toBe(false);
  });
});

describe("mountDashboard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mounts a ticking header and updates panels", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T18:05:09Z"));
    const dashboard = mountDashboard(root);
    expect(root.querySelector(".header .h-time")?.textContent).toBe("2:05:09 pm");

    vi.advanceTimersByTime(1000);
    expect(root.querySelector(".header .h-time")?.textContent).toBe("2:05:10 pm");

    dashboard.update(okSnap());
    expect(root.querySelector("[data-out-temp]")?.textContent).toBe("72");

    dashboard.stop();
    vi.advanceTimersByTime(1000);
    expect(root.querySelector(".header .h-time")?.textContent).toBe("2:05:10 pm");
  });
});

describe("reconnecting cue seam (013 US1)", () => {
  it("mounts a hidden cue in the header and exposes setReconnecting (FR-001/FR-007)", () => {
    // Arrange
    const dashboard = mountDashboard(root);

    // Act
    const cue = root.querySelector(".header .reconnecting-cue") as HTMLElement | null;

    // Assert
    expect(cue).not.toBeNull();
    expect(cue!.hidden).toBe(true);
    expect(typeof dashboard.setReconnecting).toBe("function");
    dashboard.stop();
  });

  it("setReconnecting(true) shows the cue and (false) hides it (FR-001/FR-002)", () => {
    // Arrange
    const dashboard = mountDashboard(root);
    const cue = root.querySelector(".header .reconnecting-cue") as HTMLElement;

    // Act + Assert
    dashboard.setReconnecting(true);
    expect(cue.hidden).toBe(false);
    dashboard.setReconnecting(false);
    expect(cue.hidden).toBe(true);
    dashboard.stop();
  });

  it("toggling the cue never blanks or corrupts rendered panel values (FR-004/SC-003)", () => {
    // Arrange
    const dashboard = mountDashboard(root);
    dashboard.update(okSnap());
    const panelBefore = root.querySelector("[data-out-temp]")!.outerHTML;

    // Act
    dashboard.setReconnecting(true);
    dashboard.setReconnecting(false);

    // Assert — panel HTML byte-identical across the toggles
    expect(root.querySelector("[data-out-temp]")!.outerHTML).toBe(panelBefore);
    dashboard.stop();
  });

  it("does not interfere with a panel's Fresh/Stale state (G1, edge case)", () => {
    // Arrange — a stale snapshot marks the outdoor host .stale
    const dashboard = mountDashboard(root);
    dashboard.update(okSnap(reading({ observedAt: "2026-06-19T21:00:00Z" })));
    const outdoor = root.querySelector("[data-ring='outdoor']")!;
    expect(outdoor.classList.contains("stale")).toBe(true);

    // Act
    dashboard.setReconnecting(true);
    dashboard.setReconnecting(false);

    // Assert — stale treatment untouched by the cue
    expect(outdoor.classList.contains("stale")).toBe(true);
    dashboard.stop();
  });

  it("shows the cue in the initial no-data state without altering panel content (G2, edge case)", () => {
    // Arrange — mounted, no update yet (first-paint failure)
    const dashboard = mountDashboard(root);
    const mainBefore = root.querySelector("main")!.innerHTML;

    // Act
    dashboard.setReconnecting(true);

    // Assert — cue shows; the no-data panel area is unchanged
    expect((root.querySelector(".header .reconnecting-cue") as HTMLElement).hidden).toBe(false);
    expect(root.querySelector("main")!.innerHTML).toBe(mainBefore);
    dashboard.stop();
  });
});

describe("sensor health overlay wiring (US3)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const ws90Health: LatestSnapshot["sensorHealth"] = {
    available: true,
    stale: false,
    capturedAtUtc: "2026-06-22T20:19:00Z",
    sensors: [
      {
        id: "1242D",
        img: "wh90",
        type: 48,
        name: "WS90",
        battery: "OK",
        batteryRaw: 5,
        signalBars: 4,
        rssiDbm: -74,
        registered: true,
        lastSeenUtc: "2026-06-22T20:19:00Z",
      },
    ],
  };

  it("mounts a hidden health overlay and reveals it from the header 'Sensors' item", () => {
    const dashboard = mountDashboard(root);
    const overlay = root.querySelector<HTMLElement>(".sensor-health-overlay")!;
    expect(overlay).not.toBeNull();
    expect(overlay.hidden).toBe(true);

    // Open the menu, choose Sensors → overlay reveals.
    root.querySelector<HTMLButtonElement>(".hamburger")!.click();
    const sensors = [...root.querySelectorAll<HTMLElement>(".nav-item")].find(
      (n) => n.textContent === "Sensors",
    )!;
    sensors.click();
    expect(overlay.hidden).toBe(false);
    dashboard.stop();
  });

  it("populates the overlay rows from the snapshot's sensorHealth", () => {
    const dashboard = mountDashboard(root);
    const snap = okSnap();
    snap.sensorHealth = ws90Health;
    dashboard.update(snap);
    const overlay = root.querySelector<HTMLElement>(".sensor-health-overlay")!;
    expect(overlay.querySelectorAll(".sh-row")).toHaveLength(1);
    expect(
      overlay.querySelector(".sh-row[data-sensor-id='1242D'] .batt-badge")?.getAttribute(
        "data-battery",
      ),
    ).toBe("OK");
    dashboard.stop();
  });
});

describe("per-card sensor indicators (US2)", () => {
  const health: LatestSnapshot["sensorHealth"] = {
    available: true,
    stale: false,
    capturedAtUtc: "2026-06-22T20:19:00Z",
    sensors: [
      {
        id: "1242D",
        img: "wh90",
        type: 48,
        name: "WS90",
        battery: "OK",
        batteryRaw: 5,
        signalBars: 4,
        rssiDbm: -74,
        registered: true,
        lastSeenUtc: "2026-06-22T20:19:00Z",
      },
    ],
  };

  it("attaches the one WS90 record (bars + OK) to every WS90-backed card", () => {
    const snap = okSnap();
    snap.sensorHealth = health;
    renderSnapshot(snap, root);
    // solar + rain are both backed by the single WS90 (one record, not two radios).
    for (const panel of ["solar", "rain"]) {
      const ind = root.querySelector<HTMLElement>(`[data-panel="${panel}"] > .sensor-indicator`)!;
      expect(ind.getAttribute("data-sensor-indicator")).toBe("1242D");
      expect(ind.querySelector(".sig-bars")?.getAttribute("data-signal-bars")).toBe("4");
      expect(ind.querySelector(".batt-badge")?.getAttribute("data-battery")).toBe("OK");
    }
  });

  it("attaches NO indicator to indoor/baro (no backing get_sensors_info radio)", () => {
    const snap = okSnap();
    snap.sensorHealth = health;
    renderSnapshot(snap, root);
    for (const panel of ["indoor", "baro"]) {
      const ind = root.querySelector<HTMLElement>(`[data-panel="${panel}"] > .sensor-indicator`);
      expect(ind, `${panel} should have no sensor indicator`).toBeNull();
    }
  });

  it("degrades a mapped card to Unknown when its sensor is absent from a fresh set", () => {
    // The WS90 is registered but momentarily missing from this fresh snapshot's
    // sensors[] (e.g. it dropped from get_sensors_info that cycle) → the card's
    // find() misses and the indicator honestly degrades to Unknown, never a
    // fabricated reading.
    const snap = okSnap();
    snap.sensorHealth = { available: true, stale: false, capturedAtUtc: "2026-06-22T20:19:00Z", sensors: [] };
    renderSnapshot(snap, root);
    const ind = root.querySelector<HTMLElement>(`[data-panel="solar"] > .sensor-indicator`)!;
    expect(ind.getAttribute("data-sensor-indicator")).toBe("unknown");
    expect(ind.querySelector(".batt-badge")?.getAttribute("data-battery")).toBe("Unknown");
  });

  it("renders Unknown indicators when the health envelope is stale", () => {
    const snap = okSnap();
    snap.sensorHealth = { ...health, stale: true };
    renderSnapshot(snap, root);
    const ind = root.querySelector<HTMLElement>(`[data-panel="solar"] > .sensor-indicator`)!;
    expect(ind.getAttribute("data-sensor-indicator")).toBe("unknown");
    expect(ind.querySelector(".batt-badge")?.getAttribute("data-battery")).toBe("Unknown");
  });

  it("re-creates each card indicator on every render (no duplication)", () => {
    const snap = okSnap();
    snap.sensorHealth = health;
    renderSnapshot(snap, root);
    renderSnapshot(snap, root);
    expect(
      root.querySelectorAll(`[data-panel="solar"] > .sensor-indicator`),
    ).toHaveLength(1);
  });

  it("attaches honest Unknown indicators even in the missing (no-reading) branch", () => {
    renderSnapshot(noDataSnap(), root);
    const ind = root.querySelector<HTMLElement>(`[data-panel="solar"] > .sensor-indicator`);
    expect(ind).not.toBeNull();
    expect(ind?.getAttribute("data-sensor-indicator")).toBe("unknown");
  });
});
