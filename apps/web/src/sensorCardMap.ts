/**
 * Static card → backing-sensor map (US2 / FR-008). The dashboard's physical
 * wiring of cards to sensors is fixed and known, so a small static table is the
 * simplest sufficient design (research D4):
 *
 * - The single WS90 (`12FAD`) drives the outdoor/solar/rain cards, so all three
 *   reflect **one** radio's health — never three independent radios.
 * - The wired wh25 (`C7`) backs the indoor + barometer cards with **no** radio
 *   indicator (N/A battery, no signal strip).
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
  { panel: "outdoor", sensorId: "12FAD", radio: true },
  { panel: "solar", sensorId: "12FAD", radio: true },
  { panel: "rain", sensorId: "12FAD", radio: true },
  { panel: "indoor", sensorId: "C7", radio: false },
  { panel: "baro", sensorId: "C7", radio: false },
];
