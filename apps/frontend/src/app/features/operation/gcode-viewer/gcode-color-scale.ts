export type GcodeColorMode = 'plain' | 'speed' | 'power';

export interface ValueRange {
  min: number;
  max: number;
}

/** The G1 stroke color for "Plain" mode, and the fallback whenever a gradient can't be computed
 * (e.g. every segment shares the same value, or this segment's value is unknown) — matches the
 * always-red style the viewer used before per-segment colorization existed. */
export const PLAIN_G1_COLOR = '#dc2626';

/** Maps `value` linearly between `range.min`/`range.max` to a color on a 180° (light blue, the
 * lowest value) → 0° (vivid red, the highest value) hue gradient — a value exactly halfway between
 * the two lands on 90° (light green). Saturation/lightness are fixed across the gradient; only the
 * hue changes. Falls back to `PLAIN_G1_COLOR` when there's no meaningful range to place `value` on
 * (an unknown value, or every segment sharing the same one). */
export function colorForValue(value: number | null, range: ValueRange): string {
  if (value == null || range.max <= range.min) {
    return PLAIN_G1_COLOR;
  }
  const t = Math.min(Math.max((value - range.min) / (range.max - range.min), 0), 1);
  const hue = 180 * (1 - t);
  return `hsl(${hue}, 85%, 50%)`;
}

/** The [min, max] of every non-null value in `values` — `{ min: 0, max: 0 }` (a zero-width range,
 * so `colorForValue` falls back to plain) when none of them are known. */
export function computeValueRange(values: (number | null)[]): ValueRange {
  const known = values.filter((value): value is number => value != null);
  if (known.length === 0) {
    return { min: 0, max: 0 };
  }
  return { min: Math.min(...known), max: Math.max(...known) };
}
