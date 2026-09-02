import { Point, Subpath } from './workspace-svg-parser';

const EPSILON = 1e-6;

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function computeBoundingBox(subpaths: Subpath[]): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const subpath of subpaths) {
    for (const point of subpath.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  return { minX, minY, maxX, maxY };
}

function boundingBoxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.minX <= b.maxX + EPSILON &&
    a.maxX >= b.minX - EPSILON &&
    a.minY <= b.maxY + EPSILON &&
    a.maxY >= b.minY - EPSILON
  );
}

/** Whether every point of `subpaths` falls within the [0, width] x [0, height] cutting surface. */
export function isWithinSurface(subpaths: Subpath[], width: number, height: number): boolean {
  for (const subpath of subpaths) {
    for (const point of subpath.points) {
      if (point.x < -EPSILON || point.x > width + EPSILON || point.y < -EPSILON || point.y > height + EPSILON) {
        return false;
      }
    }
  }
  return true;
}

function orientation(p: Point, q: Point, r: Point): 0 | 1 | 2 {
  const value = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(value) < EPSILON) return 0;
  return value > 0 ? 1 : 2;
}

/** Whether `q` lies within the bounding box of segment `p`-`r` — only meaningful once `p`, `q`,
 * `r` are already known to be collinear (checked by the caller via `orientation`). */
function onSegment(p: Point, q: Point, r: Point): boolean {
  return (
    q.x <= Math.max(p.x, r.x) + EPSILON &&
    q.x >= Math.min(p.x, r.x) - EPSILON &&
    q.y <= Math.max(p.y, r.y) + EPSILON &&
    q.y >= Math.min(p.y, r.y) - EPSILON
  );
}

/** Classic O'Rourke/CLRS segment-intersection test (general crossing case + the three collinear
 * "touches" cases). Two segments that merely share an endpoint (e.g. adjacent shapes placed
 * corner-to-corner) are reported as intersecting too — deliberately inclusive, since a laser job
 * has no legitimate reason to place two independent cut paths at a shared point. */
function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;

  return false;
}

function* subpathEdges(subpath: Subpath): Generator<[Point, Point]> {
  const points = subpath.points;
  for (let i = 0; i + 1 < points.length; i++) {
    yield [points[i], points[i + 1]];
  }
  if (subpath.closed && points.length > 1) {
    yield [points[points.length - 1], points[0]];
  }
}

/** Whether any edge of `a` crosses any edge of `b` — a shape's own subpaths (e.g. an outer
 * contour plus a nested hole) are never compared against each other, only across the two given
 * paths, per the "independent <path> elements" rule. */
export function pathsIntersect(a: Subpath[], b: Subpath[]): boolean {
  if (!boundingBoxesOverlap(computeBoundingBox(a), computeBoundingBox(b))) {
    return false;
  }
  for (const subpathA of a) {
    for (const [p1, p2] of subpathEdges(subpathA)) {
      for (const subpathB of b) {
        for (const [p3, p4] of subpathEdges(subpathB)) {
          if (segmentsIntersect(p1, p2, p3, p4)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}
