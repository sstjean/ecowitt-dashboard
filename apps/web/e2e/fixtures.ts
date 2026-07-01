/**
 * Deterministic `/api/v1/latest` payloads for the Playwright UI suite.
 *
 * Values mirror a Florida-summer afternoon so the rounded display strings are
 * stable and meaningful. `observedAt`/`serverTime` are only 30 s apart so the
 * dashboard renders Fresh (not Stale). Timezone anchors: the UTC sun times below
 * convert to 6:27 AM / 8:25 PM in America/New_York (EDT, UTC−4), which the suite
 * asserts to prove Eastern rendering.
 *
 * Kept as plain objects (no cross-package value import) so Playwright can load
 * this without resolving the workspace's TypeScript sources at runtime.
 */
export const latestSnapshot = {
  status: "ok",
  observedAt: "2026-06-22T20:19:00Z",
  reading: {
    observedAt: "2026-06-22T20:19:00Z",
    outdoorTempF: 88.5,
    feelsLikeF: 97.2,
    dewpointF: 73.1,
    outdoorHumidityPct: 62,
    dayHighF: 91,
    dayLowF: 74,
    windMph: 6.5,
    windDirDeg: 135,
    gustMph: 12,
    windAvg10mMph: 6.5,
    windAvg10mDirDeg: 135,
    maxDailyGustMph: 18,
    maxDailyGustDir: "SE",
    solarWm2: 720,
    uvIndex: 7,
    indoorTempF: 74.5,
    indoorHumidityPct: 51,
    rainEventIn: 0.12,
    rainHourlyIn: 0.05,
    rainDailyIn: 0.35,
    rainWeeklyIn: 1.2,
    rainMonthlyIn: 3.4,
    rainYearlyIn: 24.6,
    rainRateInHr: 0.08,
    isRaining: true,
    pressureHpa: 1014.2,
  },
  astro: {
    sunriseUtc: "2026-06-22T10:27:00Z",
    sunsetUtc: "2026-06-23T00:25:00Z",
    sunAltitudeFraction: 0.62,
    moonPhase: 0.25,
  },
  baroTrend: { direction: "rising", deltaHpa: 1.2, etaMinutes: null },
  conditionIcon: "partly-cloudy",
  conditionStale: false,
  conditionText: "Partly Sunny",
  rainSensorSuspect: false,
  rainSensorReason: null,
  sensorHealth: {
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
        rssiDbm: -76,
        registered: true,
        lastSeenUtc: "2026-06-22T20:19:00Z",
      },
      {
        id: "A0",
        img: "wh31",
        type: 7,
        name: "CH2",
        battery: "OK",
        batteryRaw: 0,
        signalBars: 4,
        rssiDbm: -94,
        registered: true,
        lastSeenUtc: "2026-06-22T20:19:00Z",
      },
    ],
  },
  serverTime: "2026-06-22T20:19:30Z",
} as const;

/**
 * Active-rain state: the piezo flag is set and the gauge is trusted, so the
 * "Raining now" in-column banner must render above the Daily Rain value without
 * clipping the card. Derived from {@link latestSnapshot}; envelope unchanged.
 */
export const rainingSnapshot = {
  ...latestSnapshot,
  reading: { ...latestSnapshot.reading, isRaining: true },
  rainSensorSuspect: false,
  rainSensorReason: null,
} as const;

/**
 * Suspected sensor-fault state: `rainSensorSuspect` is true with a short reason,
 * so the centered dimming overlay renders and the "Raining now" banner is
 * suppressed. The reading is dry (a stuck gauge reports no rain).
 */
export const faultSnapshot = {
  ...latestSnapshot,
  reading: {
    ...latestSnapshot.reading,
    isRaining: false,
    rainRateInHr: 0,
    rainDailyIn: 0,
  },
  rainSensorSuspect: true,
  rainSensorReason: "Storm signature with no rain measured (gust spike, pressure dip)",
} as const;

/**
 * Fault state with a deliberately long, multi-clause reason to exercise the
 * overlay's internal wrap/clip edge case: the text must wrap or clip inside the
 * overlay and never grow the fixed-height card.
 */
export const longReasonFaultSnapshot = {
  ...faultSnapshot,
  rainSensorReason:
    "Storm signature with no rain measured — a sharp temperature crash, a humidity surge, a sustained gust spike, and a pressure dip all coincided while the piezo gauge reported zero accumulation for the entire event window, strongly suggesting the rain sensor is blocked, frozen, or otherwise not reporting.",
} as const;

/** The `no-data` envelope: no reading yet, so panels fall back to Missing. */
export const noDataSnapshot = {
  status: "no-data",
  observedAt: null,
  reading: null,
  astro: {
    sunriseUtc: "2026-06-22T10:27:00Z",
    sunsetUtc: "2026-06-23T00:25:00Z",
    sunAltitudeFraction: 0.62,
    moonPhase: 0.25,
  },
  baroTrend: { direction: "unavailable", deltaHpa: null, etaMinutes: null },
  conditionIcon: null,
  conditionStale: true,
  conditionText: null,
  rainSensorSuspect: false,
  rainSensorReason: null,
  sensorHealth: { available: false, stale: true, capturedAtUtc: null, sensors: [] },
  serverTime: "2026-06-22T20:19:30Z",
} as const;
