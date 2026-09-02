import { Point, Subpath } from './workspace-svg-parser';

export interface HatchSegment {
  start: Point;
  end: Point;
}

const EPSILON = 1e-6;
/** cos(45°) === sin(45°); rotating by ±45° only ever needs this one constant. */
const COS45 = Math.SQRT1_2;

/** Rotates a point by -45° around the origin — in this space, lines that are horizontal
 * correspond to lines at +45° back in the original space (see `fromHatchSpace`). Rotation
 * doesn't change which points are inside/outside a polygon, so scanning horizontally here and
 * rotating back gives 45°-oriented hatch lines "for free", with a plain axis-aligned scanline
 * algorithm. */
function toHatchSpace(p: Point): Point {
  return { x: (p.x + p.y) * COS45, y: (p.y - p.x) * COS45 };
}

function fromHatchSpace(p: Point): Point {
  return { x: (p.x - p.y) * COS45, y: (p.x + p.y) * COS45 };
}

/** Every edge of every subpath, always including the closing edge (last point back to first)
 * regardless of the subpath's own `closed` flag — per the SVG fill model, a shape being filled is
 * always treated as implicitly closed, even if its outline (for stroking purposes) isn't. */
function* fillEdges(subpaths: Subpath[]): Generator<[Point, Point]> {
  for (const subpath of subpaths) {
    const points = subpath.points;
    for (let i = 0; i + 1 < points.length; i++) {
      yield [points[i], points[i + 1]];
    }
    if (points.length > 1) {
      yield [points[points.length - 1], points[0]];
    }
  }
}

/**
 * Computes 45°-oriented hatch fill lines for a shape made of one or more subpaths (an outer
 * contour plus any nested holes), `spacingMm` apart, honouring the evenodd fill rule so holes
 * stay unfilled — exactly like the shape's own `fill-rule="evenodd"` in the SVG.
 *
 * Standard scanline-fill algorithm, run in a space rotated -45° so the (still axis-aligned)
 * scanlines come out at +45° once transformed back: for each scanline, every edge is intersected
 * with it, the intersections are sorted, and consecutive pairs alternate inside/outside — which
 * is the definition of the evenodd rule, so nested holes fall out correctly with no special
 * casing. Consecutive lines alternate direction (boustrophedon) to keep travel moves short.
 */
export function computeHatchSegments(subpaths: Subpath[], spacingMm: number): HatchSegment[] {
  const rotatedEdges = [...fillEdges(subpaths)].map(([a, b]): [Point, Point] => [toHatchSpace(a), toHatchSpace(b)]);
  if (rotatedEdges.length === 0) {
    return [];
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (const [a, b] of rotatedEdges) {
    minY = Math.min(minY, a.y, b.y);
    maxY = Math.max(maxY, a.y, b.y);
  }

  const segments: HatchSegment[] = [];
  let lineIndex = 0;
  for (let y = minY + spacingMm / 2; y < maxY; y += spacingMm, lineIndex++) {
    const xs: number[] = [];
    for (const [a, b] of rotatedEdges) {
      const lower = Math.min(a.y, b.y);
      const upper = Math.max(a.y, b.y);
      // Half-open [lower, upper) so a shared vertex between two edges is never counted twice.
      if (y < lower || y >= upper) continue;
      xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);

    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xStart = xs[k];
      const xEnd = xs[k + 1];
      if (xEnd - xStart < EPSILON) continue;
      const start = fromHatchSpace({ x: xStart, y });
      const end = fromHatchSpace({ x: xEnd, y });
      // Alternate direction every other line so consecutive fill moves stay adjacent.
      segments.push(lineIndex % 2 === 0 ? { start, end } : { start: end, end: start });
    }
  }

  return segments;
}
