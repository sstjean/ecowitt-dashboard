export type Rgb = [number, number, number];

/**
 * Temperature → colour anchor stops (°F → hex), design-language §5.3.
 * Visible-spectrum ramp: violet (frigid) → … → red (extreme), to 120°F so
 * summer "feels like" heat-index values past 100°F still map to a distinct hot
 * colour. Colours are linearly interpolated between adjacent stops.
 */
export const TEMP_STOPS: ReadonlyArray<readonly [number, string]> = [
  [10, "#8a2be2"],
  [25, "#4a4fe0"],
  [38, "#2274e0"],
  [50, "#14b8c4"],
  [62, "#34c759"],
  [74, "#f2c200"],
  [86, "#ff8c1a"],
  [100, "#f0492b"],
  [120, "#d61f1f"],
];

export function hexToRgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function rgbToCss([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** The interpolated colour for a temperature, as an [r,g,b] tuple (0–255). */
export function tempColorRgb(tempF: number): Rgb {
  const first = TEMP_STOPS[0]!;
  const last = TEMP_STOPS[TEMP_STOPS.length - 1]!;
  if (tempF <= first[0]) {
    return hexToRgb(first[1]);
  }
  if (tempF >= last[0]) {
    return hexToRgb(last[1]);
  }
  let i = 1;
  while (tempF > TEMP_STOPS[i]![0]) {
    i++;
  }
  const [t0, c0] = TEMP_STOPS[i - 1]!;
  const [t1, c1] = TEMP_STOPS[i]!;
  const f = (tempF - t0) / (t1 - t0);
  const a = hexToRgb(c0);
  const b = hexToRgb(c1);
  const lerp = (x: number, y: number): number => Math.round(x + (y - x) * f);
  return [lerp(a[0], b[0]), lerp(a[1], b[1]), lerp(a[2], b[2])];
}

/** The interpolated colour for a temperature, as a css `rgb()` string. */
export function tempColor(tempF: number): string {
  return rgbToCss(tempColorRgb(tempF));
}

/**
 * Shift an rgb tuple toward white (amount > 0) or black (amount < 0). `amount`
 * is a 0–1 fraction of the distance to the target.
 */
export function shade([r, g, b]: Rgb, amount: number): Rgb {
  const target = amount >= 0 ? 255 : 0;
  const f = Math.abs(amount);
  const mix = (v: number): number => Math.round(v + (target - v) * f);
  return [mix(r), mix(g), mix(b)];
}

/**
 * The light↔dark gradient pair for a temperature ring stroke: a lighter stop
 * (offset 0) and a darker stop (offset 1) of the §5.3 colour.
 */
export function tempGradientStops(tempF: number): { light: string; dark: string } {
  const base = tempColorRgb(tempF);
  return {
    light: rgbToCss(shade(base, 0.22)),
    dark: rgbToCss(shade(base, -0.18)),
  };
}

