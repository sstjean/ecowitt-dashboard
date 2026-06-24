import {
  cloudRealtimeSchema,
  type GatewayItem,
  type GatewayResponse,
} from "./schema.ts";

/**
 * Pure translation adapter (Feature 002 / LiveMock). Converts a validated cloud
 * `real_time` `data` object into the `get_livedata_info` gateway shape that the
 * existing `normalizeToFullMetricMap` consumes **unchanged**. No I/O.
 *
 * Three fields the cloud `real_time` endpoint does not provide are synthesized
 * (research D4/D5): `maxDailyGustMph` (0x19) ← current gust, `windAvg10mDirDeg`
 * (0x6D) ← current direction, and the `srain_piezo` rain flag ← `rain_rate > 0`.
 * Pressure is passed through in inHg because the mapper unconditionally applies
 * `inHgToHpa` (FR-005/FR-013). The tipping-bucket `rainfall` group is ignored
 * (FR-010); only `rainfall_piezo` is used.
 */
export function cloudRealtimeToGateway(data: unknown): GatewayResponse {
  const d = cloudRealtimeSchema.parse(data);

  const isRaining = Number.parseFloat(d.rainfall_piezo.rain_rate.value) > 0;

  const common_list: GatewayItem[] = [
    { id: "0x02", val: d.outdoor.temperature.value, unit: "℉" },
    { id: "0x07", val: d.outdoor.humidity.value },
    { id: "3", val: d.outdoor.feels_like.value, unit: "℉" },
    { id: "0x03", val: d.outdoor.dew_point.value, unit: "℉" },
    { id: "0x0B", val: d.wind.wind_speed.value, unit: "mph" },
    { id: "0x0C", val: d.wind.wind_gust.value, unit: "mph" },
    { id: "0x0A", val: d.wind.wind_direction.value },
    { id: "0x15", val: d.solar_and_uvi.solar.value },
    { id: "0x17", val: d.solar_and_uvi.uvi.value },
    // Synthesized (Decision A / D4):
    { id: "0x19", val: d.wind.wind_gust.value, unit: "mph" },
    { id: "0x6D", val: d.wind.wind_direction.value },
  ];

  const piezoRain: GatewayItem[] = [
    { id: "srain_piezo", val: isRaining ? "1" : "0" },
    { id: "0x0D", val: d.rainfall_piezo.event.value, unit: "in" },
    { id: "0x0E", val: d.rainfall_piezo.rain_rate.value, unit: "in/hr" },
    { id: "0x7C", val: d.rainfall_piezo.hourly.value, unit: "in" },
    { id: "0x10", val: d.rainfall_piezo.daily.value, unit: "in" },
    { id: "0x11", val: d.rainfall_piezo.weekly.value, unit: "in" },
    { id: "0x12", val: d.rainfall_piezo.monthly.value, unit: "in" },
    { id: "0x13", val: d.rainfall_piezo.yearly.value, unit: "in" },
  ];

  return {
    common_list,
    wh25: [
      {
        intemp: d.indoor.temperature.value,
        inhumi: d.indoor.humidity.value,
        abs: d.pressure.absolute.value,
        rel: d.pressure.relative.value,
        unit: "℉",
      },
    ],
    piezoRain,
  };
}
