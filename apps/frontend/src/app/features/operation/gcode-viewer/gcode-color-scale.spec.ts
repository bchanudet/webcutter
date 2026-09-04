import { colorForValue, computeValueRange, PLAIN_G1_COLOR } from './gcode-color-scale';

describe('colorForValue', () => {
  it('maps the lowest value to hue 180', () => {
    expect(colorForValue(10, { min: 10, max: 20 })).toBe('hsl(180, 85%, 50%)');
  });

  it('maps the highest value to hue 0', () => {
    expect(colorForValue(20, { min: 10, max: 20 })).toBe('hsl(0, 85%, 50%)');
  });

  it('maps a value exactly halfway to hue 90', () => {
    expect(colorForValue(15, { min: 10, max: 20 })).toBe('hsl(90, 85%, 50%)');
  });

  it('falls back to the plain color for a null value', () => {
    expect(colorForValue(null, { min: 10, max: 20 })).toBe(PLAIN_G1_COLOR);
  });

  it('falls back to the plain color when every segment shares the same value (zero-width range)', () => {
    expect(colorForValue(15, { min: 15, max: 15 })).toBe(PLAIN_G1_COLOR);
  });

  it('clamps a value outside the range instead of producing a hue outside 0-180', () => {
    expect(colorForValue(30, { min: 10, max: 20 })).toBe('hsl(0, 85%, 50%)');
    expect(colorForValue(0, { min: 10, max: 20 })).toBe('hsl(180, 85%, 50%)');
  });
});

describe('computeValueRange', () => {
  it('computes the min/max of the known values, ignoring nulls', () => {
    expect(computeValueRange([10, null, 30, 20])).toEqual({ min: 10, max: 30 });
  });

  it('returns a zero-width range when every value is null', () => {
    expect(computeValueRange([null, null])).toEqual({ min: 0, max: 0 });
  });

  it('returns a zero-width range for an empty list', () => {
    expect(computeValueRange([])).toEqual({ min: 0, max: 0 });
  });
});
