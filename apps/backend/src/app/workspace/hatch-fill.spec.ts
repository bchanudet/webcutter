import { computeHatchSegments } from './hatch-fill';
import { Subpath } from './workspace-svg-parser';

describe('computeHatchSegments', () => {
  it('returns nothing for an empty shape', () => {
    expect(computeHatchSegments([], 1)).toEqual([]);
  });

  it('produces 45°-oriented segments, spaced apart and within the shape bounds', () => {
    const square: Subpath[] = [
      { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], closed: true },
    ];

    const segments = computeHatchSegments(square, 5);

    expect(segments.length).toBeGreaterThan(0);
    for (const { start, end } of segments) {
      // A 45° line has an equal absolute change in x and y between its endpoints.
      expect(Math.abs(Math.abs(end.x - start.x) - Math.abs(end.y - start.y))).toBeLessThan(1e-6);
      for (const point of [start, end]) {
        expect(point.x).toBeGreaterThanOrEqual(-1e-6);
        expect(point.x).toBeLessThanOrEqual(10 + 1e-6);
        expect(point.y).toBeGreaterThanOrEqual(-1e-6);
        expect(point.y).toBeLessThanOrEqual(10 + 1e-6);
      }
    }
  });

  it('produces more, shorter segments as the spacing shrinks', () => {
    const square: Subpath[] = [
      { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], closed: true },
    ];

    expect(computeHatchSegments(square, 1).length).toBeGreaterThan(computeHatchSegments(square, 5).length);
  });

  it('leaves a nested hole unfilled, per the evenodd rule', () => {
    const outer: Subpath = {
      points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
      closed: true,
    };
    const hole: Subpath = {
      points: [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }],
      closed: true,
    };

    const segments = computeHatchSegments([outer, hole], 1);

    expect(segments.length).toBeGreaterThan(0);
    for (const { start, end } of segments) {
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const insideHole = midX > 5.05 && midX < 14.95 && midY > 5.05 && midY < 14.95;
      expect(insideHole).toBe(false);
    }
  });
});
