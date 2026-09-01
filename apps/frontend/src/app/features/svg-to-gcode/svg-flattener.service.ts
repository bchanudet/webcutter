import { Injectable } from '@angular/core';
import { TreeNode } from '@openng/optimus-ui/api';
import { IGNORED_TAGS, REFERENCE_ONLY_CONTAINER_TAGS } from './svg-container-tags';
import { parsePathCommands } from './svg-path-data';

/** One contiguous contour of a shape — a <path> can have several (e.g. an outer outline plus an
 * inner hole), each rendered as its own "M ... [Z]" segment within the shape's single <path d>,
 * so a fill-rule can turn overlapping ones into actual holes. */
export interface FlattenedSubpath {
  points: { x: number; y: number }[];
  /** Whether the subpath was explicitly closed (Z / an inherently closed shape like a circle). */
  closed: boolean;
}

export interface FlattenedShape {
  /** Stable within a document — same source SVG re-flattened with the same documentId always
   * produces the same ids, in the same order, so shape-keyed state (e.g. a laser offset) survives
   * a sessionStorage restore, which re-flattens from the raw source instead of deserializing it. */
  id: string;
  subpaths: FlattenedSubpath[];
  /** Key of the nearest enclosing <g> tree node, or the document's own key if ungrouped. */
  groupKey: string;
}

export interface SvgTreeNodeData {
  documentId: string;
  kind: 'document' | 'group';
}

export interface SvgFlattenResult {
  shapes: FlattenedShape[];
  width: number;
  height: number;
  skippedTags: string[];
  tree: TreeNode<SvgTreeNodeData>;
}

const SAMPLE_STEP_PX = 1.5;
const GEOMETRY_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const TRANSPARENT_CONTAINER_TAGS = new Set(['a', 'svg']);

@Injectable({ providedIn: 'root' })
export class SvgFlattenerService {
  /**
   * Parses an SVG document into flattened cut geometry and a matching layer tree, in one walk:
   * - Geometry (path/rect/circle/ellipse/line/polyline/polygon) is flattened into polylines using
   *   the browser's own SVG engine (getTotalLength/getPointAtLength/getCTM), so curves and nested
   *   transforms resolve without a path-parsing library.
   * - Each <g> becomes a tree node (labelled by its own <title>, else an auto-numbered "Layer N"),
   *   nested recursively; every shape records the key of its nearest enclosing group (or the
   *   document's own key if it sits directly under the SVG root), so a selected tree node can be
   *   matched back to the shapes it covers.
   */
  flatten(documentId: string, svgSource: string, fallbackLabel: string): SvgFlattenResult {
    const doc = new DOMParser().parseFromString(svgSource, 'image/svg+xml');
    const svgRoot = doc.documentElement;
    if (svgRoot.querySelector('parsererror') || svgRoot.tagName.toLowerCase() !== 'svg') {
      throw new Error('This file does not contain a valid SVG.');
    }

    const { width, height } = this.resolveDimensions(svgRoot);

    const host = svgRoot.cloneNode(true) as Element;
    host.setAttribute(
      'style',
      `position: fixed; top: -100000px; left: -100000px; visibility: hidden; width: ${width}px; height: ${height}px;`,
    );
    document.body.appendChild(host);

    try {
      const shapes: FlattenedShape[] = [];
      const skippedTags = new Set<string>();
      let layerCount = 0;
      let nodeCount = 0;
      let shapeCount = 0;
      const nextKey = () => `${documentId}:${nodeCount++}`;
      const nextShapeId = () => `${documentId}:shape:${shapeCount++}`;

      const walk = (node: Element, groupKey: string): TreeNode<SvgTreeNodeData>[] => {
        const childNodes: TreeNode<SvgTreeNodeData>[] = [];

        for (const child of Array.from(node.children)) {
          const tag = child.tagName.toLowerCase();
          if (IGNORED_TAGS.has(tag) || REFERENCE_ONLY_CONTAINER_TAGS.has(tag)) {
            continue;
          }
          if (TRANSPARENT_CONTAINER_TAGS.has(tag)) {
            childNodes.push(...walk(child, groupKey));
            continue;
          }
          if (tag === 'g') {
            const key = nextKey();
            const label = this.directTitle(child) ?? `Layer ${++layerCount}`;
            // Some generators (FreeCAD, notably) emit a "hole" as its own independent sibling
            // <path> instead of a second subpath inside one <path d="...">. A group with no
            // nested groups of its own can't be split further by the user anyway, so merge all
            // of its geometry into a single shape — its subpaths can then get fill-rule="evenodd"
            // holes exactly like a single multi-subpath <path> would.
            const isLeafGroup = !this.containsGroup(child);
            if (isLeafGroup) {
              const subpaths = this.collectLeafGeometry(child, host, skippedTags);
              if (subpaths.length > 0) {
                shapes.push({ id: nextShapeId(), subpaths, groupKey: key });
              }
              childNodes.push({ key, label, data: { documentId, kind: 'group' }, children: [] });
            } else {
              childNodes.push({
                key,
                label,
                data: { documentId, kind: 'group' },
                children: walk(child, key),
              });
            }
            continue;
          }
          if (GEOMETRY_TAGS.has(tag)) {
            const shape =
              tag === 'path'
                ? this.samplePath(child as unknown as SVGGeometryElement & SVGGraphicsElement, host)
                : this.sampleShape(child as unknown as SVGGeometryElement & SVGGraphicsElement);
            if (shape) {
              shapes.push({ id: nextShapeId(), ...shape, groupKey });
            }
            continue;
          }
          skippedTags.add(tag);
        }

        return childNodes;
      };

      const tree: TreeNode<SvgTreeNodeData> = {
        key: documentId,
        label: this.directTitle(host) ?? fallbackLabel,
        data: { documentId, kind: 'document' },
        children: walk(host, documentId),
      };

      return { shapes, width, height, skippedTags: Array.from(skippedTags), tree };
    } finally {
      host.remove();
    }
  }

  /** Whether `node` has a <g> among its children, looking through transparent <a>/<svg>
   * wrappers — a group without one is a "leaf" whose geometry gets merged into one shape. */
  private containsGroup(node: Element): boolean {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (IGNORED_TAGS.has(tag) || REFERENCE_ONLY_CONTAINER_TAGS.has(tag)) {
        continue;
      }
      if (tag === 'g') {
        return true;
      }
      if (TRANSPARENT_CONTAINER_TAGS.has(tag) && this.containsGroup(child)) {
        return true;
      }
    }
    return false;
  }

  /** Samples every geometry element directly inside a leaf group (through transparent <a>/<svg>
   * wrappers) and concatenates all of their subpaths into one list, so the whole group becomes
   * a single <path> — letting fill-rule="evenodd" turn independently-authored "hole" elements
   * into actual holes, the same way multiple subpaths within one source <path> already do. */
  private collectLeafGeometry(
    node: Element,
    host: Element,
    skippedTags: Set<string>,
  ): FlattenedSubpath[] {
    const subpaths: FlattenedSubpath[] = [];

    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (IGNORED_TAGS.has(tag) || REFERENCE_ONLY_CONTAINER_TAGS.has(tag)) {
        continue;
      }
      if (TRANSPARENT_CONTAINER_TAGS.has(tag)) {
        subpaths.push(...this.collectLeafGeometry(child, host, skippedTags));
        continue;
      }
      if (GEOMETRY_TAGS.has(tag)) {
        const shape =
          tag === 'path'
            ? this.samplePath(child as unknown as SVGGeometryElement & SVGGraphicsElement, host)
            : this.sampleShape(child as unknown as SVGGeometryElement & SVGGraphicsElement);
        if (shape) {
          subpaths.push(...shape.subpaths);
        }
        continue;
      }
      skippedTags.add(tag);
    }

    return subpaths;
  }

  private directTitle(element: Element): string | null {
    for (const child of Array.from(element.children)) {
      if (child.tagName.toLowerCase() === 'title') {
        let text = child.textContent?.trim();
        if (text) { 
          if (text.match(/^b'(.+)'$/i)){
            text = text.replace(/^b'(.+)'$/, "$1");
          }
          return text;
        }
      }
    }
    return null;
  }

  private sampleShape(
    node: SVGGeometryElement & SVGGraphicsElement,
  ): Omit<FlattenedShape, 'groupKey' | 'id'> | null {
    let totalLength: number;
    try {
      totalLength = node.getTotalLength();
    } catch {
      return null;
    }
    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      return null;
    }

    const ctm = node.getCTM();
    const stepCount = Math.max(1, Math.ceil(totalLength / SAMPLE_STEP_PX));
    const points: { x: number; y: number }[] = [];

    for (let i = 0; i <= stepCount; i++) {
      const length = (i / stepCount) * totalLength;
      const local = node.getPointAtLength(length);
      const point = ctm ? local.matrixTransform(ctm) : local;
      points.push({ x: point.x, y: point.y });
    }

    // rect/circle/ellipse/polygon report a total length that loops back to the start (closed);
    // line/polyline don't — this is exactly the "closed" distinction we need, read straight off
    // the sampled geometry instead of hard-coding it per tag.
    const closed = this.isSamePoint(points[0], points[points.length - 1]);

    return { subpaths: [{ points, closed }] };
  }

  private isSamePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
    const same = Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3;
    console.log("sameP", a, b, Math.abs(a.x - b.x), Math.abs(a.y - b.y), same);
    return same;
  }

  /**
   * Flattens a <path> by walking its own `d` commands instead of uniformly re-sampling the
   * whole outline by arc length: straight segments (M/L/H/V/Z) are kept exactly as authored
   * (so corners stay sharp), while each curve segment (C/S/Q/T/A) is interpolated by handing
   * just that segment to a throwaway <path> and letting the browser's own getTotalLength/
   * getPointAtLength evaluate it — no Bezier/arc math to get wrong here.
   */
  private samplePath(
    node: SVGGeometryElement & SVGGraphicsElement,
    host: Element,
  ): Omit<FlattenedShape, 'groupKey' | 'id'> | null {
    const d = node.getAttribute('d');
    if (!d) {
      return null;
    }

    const commands = parsePathCommands(d);
    if (commands.length === 0) {
      return null;
    }

    const curveSampler = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    ) as SVGPathElement;
    host.appendChild(curveSampler);

    try {
      // Each "M" starts a new subpath (e.g. an outer outline plus an inner hole, both within
      // the same <path>); keeping them separate — instead of one flat point list — is what lets
      // the caller render a single <path> with fill-rule="evenodd" and get real holes.
      const subpaths: FlattenedSubpath[] = [];
      let currentPoints: { x: number; y: number }[] = [];
      let currentClosed = false;
      let current = { x: 0, y: 0 };
      let subpathStart = { x: 0, y: 0 };
      let prevCubicControl: { x: number; y: number } | null = null;
      let prevQuadControl: { x: number; y: number } | null = null;

      const flushSubpath = () => {
        if (currentPoints.length >= 2) {
          // Some generators (FreeCAD included) close a subpath by repeating its start point as a
          // plain "L" instead of using "Z" — without this, such a subpath is silently treated as
          // open by everything downstream (fill-rule holes, laser-offset inward/outward, etc).
          const implicitlyClosed = this.isSamePoint(
            currentPoints[0],
            currentPoints[currentPoints.length - 1],
          );
          subpaths.push({ points: currentPoints, closed: currentClosed || implicitlyClosed });
        }
        currentPoints = [];
        currentClosed = false;
      };

      const resolve = (x: number, y: number, relative: boolean): { x: number; y: number } =>
        relative ? { x: current.x + x, y: current.y + y } : { x, y };

      const sampleCurve = (subPathD: string) => {
        curveSampler.setAttribute('d', subPathD);
        let totalLength: number;
        try {
          totalLength = curveSampler.getTotalLength();
        } catch {
          return;
        }
        if (!Number.isFinite(totalLength) || totalLength <= 0) {
          return;
        }
        const stepCount = Math.max(1, Math.ceil(totalLength / SAMPLE_STEP_PX));
        for (let i = 1; i <= stepCount; i++) {
          const length = (i / stepCount) * totalLength;
          const point = curveSampler.getPointAtLength(length);
          currentPoints.push({ x: point.x, y: point.y });
        }
      };

      for (const command of commands) {
        const relative = command.code === command.code.toLowerCase();
        const upper = command.code.toUpperCase();

        switch (upper) {
          case 'M': {
            flushSubpath();
            const point = resolve(command.args[0], command.args[1], relative);
            current = point;
            subpathStart = point;
            currentPoints.push(point);
            prevCubicControl = null;
            prevQuadControl = null;
            break;
          }
          case 'L': {
            current = resolve(command.args[0], command.args[1], relative);
            currentPoints.push(current);
            prevCubicControl = null;
            prevQuadControl = null;
            break;
          }
          case 'H': {
            current = { x: relative ? current.x + command.args[0] : command.args[0], y: current.y };
            currentPoints.push(current);
            prevCubicControl = null;
            prevQuadControl = null;
            break;
          }
          case 'V': {
            current = { x: current.x, y: relative ? current.y + command.args[0] : command.args[0] };
            currentPoints.push(current);
            prevCubicControl = null;
            prevQuadControl = null;
            break;
          }
          case 'C': {
            const c1 = resolve(command.args[0], command.args[1], relative);
            const c2 = resolve(command.args[2], command.args[3], relative);
            const end = resolve(command.args[4], command.args[5], relative);
            sampleCurve(`M ${current.x} ${current.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`);
            current = end;
            prevCubicControl = c2;
            prevQuadControl = null;
            break;
          }
          case 'S': {
            const c1: { x: number; y: number } = prevCubicControl
              ? { x: 2 * current.x - prevCubicControl.x, y: 2 * current.y - prevCubicControl.y }
              : current;
            const c2 = resolve(command.args[0], command.args[1], relative);
            const end = resolve(command.args[2], command.args[3], relative);
            sampleCurve(`M ${current.x} ${current.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`);
            current = end;
            prevCubicControl = c2;
            prevQuadControl = null;
            break;
          }
          case 'Q': {
            const c1 = resolve(command.args[0], command.args[1], relative);
            const end = resolve(command.args[2], command.args[3], relative);
            sampleCurve(`M ${current.x} ${current.y} Q ${c1.x} ${c1.y} ${end.x} ${end.y}`);
            current = end;
            prevQuadControl = c1;
            prevCubicControl = null;
            break;
          }
          case 'T': {
            const c1: { x: number; y: number } = prevQuadControl
              ? { x: 2 * current.x - prevQuadControl.x, y: 2 * current.y - prevQuadControl.y }
              : current;
            const end = resolve(command.args[0], command.args[1], relative);
            sampleCurve(`M ${current.x} ${current.y} Q ${c1.x} ${c1.y} ${end.x} ${end.y}`);
            current = end;
            prevQuadControl = c1;
            prevCubicControl = null;
            break;
          }
          case 'A': {
            const [rx, ry, rotation, largeArc, sweep] = command.args;
            const end = resolve(command.args[5], command.args[6], relative);
            sampleCurve(
              `M ${current.x} ${current.y} A ${rx} ${ry} ${rotation} ${largeArc} ${sweep} ${end.x} ${end.y}`,
            );
            current = end;
            prevCubicControl = null;
            prevQuadControl = null;
            break;
          }
          case 'Z': {
            currentPoints.push(subpathStart);
            currentClosed = true;
            current = subpathStart;
            prevCubicControl = null;
            prevQuadControl = null;
            break;
          }
        }
      }
      flushSubpath();

      if (subpaths.length === 0) {
        return null;
      }

      const ctm = node.getCTM();
      const transformedSubpaths = subpaths.map((subpath) => ({
        points: subpath.points.map((point) => (ctm ? this.applyMatrix(point, ctm) : point)),
        closed: subpath.closed,
      }));

      return { subpaths: transformedSubpaths };
    } finally {
      curveSampler.remove();
    }
  }

  private applyMatrix(point: { x: number; y: number }, matrix: DOMMatrix): { x: number; y: number } {
    return {
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    };
  }

  private resolveDimensions(svgRoot: Element): { width: number; height: number } {
    const viewBox = svgRoot.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
        return { width: parts[2], height: parts[3] };
      }
    }

    const width = Number.parseFloat(svgRoot.getAttribute('width') ?? '');
    const height = Number.parseFloat(svgRoot.getAttribute('height') ?? '');
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }

    return { width: 100, height: 100 };
  }
}
