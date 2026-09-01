/**
 * Minimal typing for the `polygon-offset` npm package (untyped upstream) — only the surface this
 * app actually calls. See https://github.com/w8r/polygon-offset.
 */
declare module 'polygon-offset' {
  export default class Offset {
    data(points: number[][]): this;
    /** Positive grows the polygon (margin), negative shrinks it (padding). Returns one or more
     * linear rings — several when a large shrink splits the polygon into disjoint pieces. */
    offset(delta: number): number[][][] | number[][];
    margin(delta: number): number[][][];
    padding(delta: number): number[][][];
    arcSegments(count: number): this;
  }
}
