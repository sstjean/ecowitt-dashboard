import {
  gatewayResponseSchema,
  mappedReadingSchema,
  type FullMetricMap,
  type GatewayItem,
  type MappedReading,
} from "./schema.ts";

// ---------------------------------------------------------------------------
// Pure unit conversions. Display units are fixed: °F, mph, inches, hPa.
// ---------------------------------------------------------------------------

/** Celsius → Fahrenheit. */
export function cToF(c: number): number {
  return c * (9 / 5) + 32;
}

/** Metres/second → miles/hour. */
export function msToMph(ms: number): number {
  return ms * 2.2369362920544;
}

/** Millimetres → inches. */
export function mmToIn(mm: number): number {
  return mm / 25.4;
}

/** Inches of mercury → hectopascals. */
export function inHgToHpa(inHg: number): number {
  return inHg * 33.8639;
}

function parseNum(raw: string): number {
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) {
    throw new Error(`Expected a numeric value but got "${raw}"`);
  }
  return n;
}

/** Temperature in °F, converting from °C when the unit says so. */
function toF(value: string, unit: string): number {
  const n = parseNum(value);
  return /c/i.test(unit) ? cToF(n) : n;
}

/** Wind speed in mph, converting from m/s when the unit says so. */
function toMph(value: string, unit: string): number {
  const n = parseNum(value);
  return /m\/s/i.test(unit) ? msToMph(n) : n;
}

/** Rain depth in inches, converting from mm when the unit says so. */
function toIn(value: string, unit: string): number {
  const n = parseNum(value);
  return /mm/i.test(unit) ? mmToIn(n) : n;
}

const COMMON_NUMBER: Record<string, (item: GatewayItem) => [string, number]> = {
  "0x02": (i) => ["outdoorTempF", toF(i.val, i.unit ?? "")],
  "0x07": (i) => ["outdoorHumidityPct", parseNum(i.val)],
  "3": (i) => ["feelsLikeF", toF(i.val, i.unit ?? "")],
  "0x03": (i) => ["dewpointF", toF(i.val, i.unit ?? "")],
  "0x0B": (i) => ["windMph", toMph(i.val, i.unit ?? "")],
  "0x0C": (i) => ["gustMph", toMph(i.val, i.unit ?? "")],
  "0x19": (i) => ["maxDailyGustMph", toMph(i.val, i.unit ?? "")],
  "0x0A": (i) => ["windDirDeg", parseNum(i.val)],
  "0x6D": (i) => ["windAvg10mDirDeg", parseNum(i.val)],
  "0x15": (i) => ["solarWm2", parseNum(i.val)],
  "0x17": (i) => ["uvIndex", parseNum(i.val)],
};

const PIEZO_RAIN: Record<string, string> = {
  "0x0D": "rainEventIn",
  "0x0E": "rainRateInHr",
  "0x7C": "rainHourlyIn",
  "0x10": "rainDailyIn",
  "0x11": "rainWeeklyIn",
  "0x12": "rainMonthlyIn",
  "0x13": "rainYearlyIn",
};

const WH25_KNOWN = new Set(["intemp", "inhumi", "abs", "rel"]);

/**
 * Capture every reported field full-fidelity into a flat map. Known fields are
 * canonicalised to display units; unknown fields are preserved verbatim under a
 * category-prefixed key so nothing the gateway reports is ever discarded.
 */
export function normalizeToFullMetricMap(raw: unknown): FullMetricMap {
  const parsed = gatewayResponseSchema.parse(raw);
  const map: FullMetricMap = {};

  for (const item of parsed.common_list) {
    const known = COMMON_NUMBER[item.id];
    if (known) {
      const [name, value] = known(item);
      map[name] = value;
    } else {
      map[`common_${item.id}`] = item.val;
    }
  }

  const wh25 = parsed.wh25[0]!;
  for (const [key, value] of Object.entries(wh25)) {
    if (!WH25_KNOWN.has(key)) {
      map[`wh25_${key}`] = String(value);
    }
  }
  map.indoorTempF = toF(wh25.intemp, wh25.unit ?? "");
  map.indoorHumidityPct = parseNum(wh25.inhumi);
  map.pressureHpa = inHgToHpa(parseNum(wh25.abs));
  map.relPressureHpa = inHgToHpa(parseNum(wh25.rel));

  map.isRaining = 0;
  for (const item of parsed.piezoRain) {
    if (item.id === "srain_piezo") {
      map.isRaining = parseNum(item.val) === 0 ? 0 : 1;
      continue;
    }
    const name = PIEZO_RAIN[item.id];
    if (name) {
      map[name] = toIn(item.val, item.unit ?? "");
    } else {
      map[`piezoRain_${item.id}`] = item.val;
    }
  }

  for (const item of parsed.rain ?? []) {
    map[`rain_${item.id}`] = item.val;
  }

  return map;
}

/**
 * Project the canonical instantaneous fields out of a full metric map and
 * validate them. Throws if any required field is missing or out of bounds.
 * The four daily aggregates are added later, API-side, from stored history.
 */
export function projectLiveReading(
  map: FullMetricMap,
  observedAt: string,
): MappedReading {
  const candidate = {
    observedAt,
    outdoorTempF: map.outdoorTempF,
    feelsLikeF: map.feelsLikeF,
    dewpointF: map.dewpointF,
    outdoorHumidityPct: map.outdoorHumidityPct,
    windMph: map.windMph,
    windDirDeg: map.windDirDeg,
    gustMph: map.gustMph,
    windAvg10mDirDeg: map.windAvg10mDirDeg,
    maxDailyGustMph: map.maxDailyGustMph,
    solarWm2: map.solarWm2,
    uvIndex: map.uvIndex,
    indoorTempF: map.indoorTempF,
    indoorHumidityPct: map.indoorHumidityPct,
    rainEventIn: map.rainEventIn,
    rainHourlyIn: map.rainHourlyIn,
    rainDailyIn: map.rainDailyIn,
    rainWeeklyIn: map.rainWeeklyIn,
    rainMonthlyIn: map.rainMonthlyIn,
    rainYearlyIn: map.rainYearlyIn,
    rainRateInHr: map.rainRateInHr,
    isRaining: map.isRaining !== 0,
    pressureHpa: map.pressureHpa,
  };
  return mappedReadingSchema.parse(candidate);
}
