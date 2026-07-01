/**
 * Static card → backing-sensor map (US2 / FR-008). The dashboard's physical
 * wiring of cards to sensors is fixed and known, so a small static table is the
 * simplest sufficient design (research D4):
 *
 * - The single WS90 (`1242D`) drives the outdoor/solar/rain cards, so all three
 *   reflect **one** radio's health — never three independent radios.
 * - Indoor and barometer have **no** backing `get_sensors_info` radio: the wired
 *   wh25 is reported only in `get_livedata_info`, so those cards are absent from
 *   this map and render **no** radio/battery indicator (honest absence).
 * - The wh31 CH2 (`A0`) has no dashboard card today; it appears only on the US3
 *   Sensor Health page.
 */
export interface CardSensorBinding {
  /** The card's `data-panel` attribute. */
  panel: string;
  /** The backing radio id in the served `sensorHealth.sensors` set. */
  sensorId: string;
  /** Whether the card shows a radio signal indicator (false for wired sensors). */
  radio: boolean;
}

export const sensorCardMap: readonly CardSensorBinding[] = [
  { panel: "outdoor", sensorId: "1242D", radio: true },
  { panel: "solar", sensorId: "1242D", radio: true },
  { panel: "rain", sensorId: "1242D", radio: true },
];
