import { Injectable } from '@angular/core';
import { TreeNode } from '@openng/optimus-ui/api';
import { IGNORED_TAGS, REFERENCE_ONLY_CONTAINER_TAGS } from './svg-container-tags';

export interface FlattenedShape {
  points: { x: number; y: number }[];
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
      const nextKey = () => `${documentId}:${nodeCount++}`;

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
            childNodes.push({
              key,
              label,
              data: { documentId, kind: 'group' },
              children: walk(child, key),
            });
            continue;
          }
          if (GEOMETRY_TAGS.has(tag)) {
            const shape = this.sampleShape(child as unknown as SVGGeometryElement & SVGGraphicsElement);
            if (shape) {
              shapes.push({ ...shape, groupKey });
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

  private directTitle(element: Element): string | null {
    for (const child of Array.from(element.children)) {
      if (child.tagName.toLowerCase() === 'title') {
        const text = child.textContent?.trim();
        if (text) {
          return text;
        }
      }
    }
    return null;
  }

  private sampleShape(
    node: SVGGeometryElement & SVGGraphicsElement,
  ): Omit<FlattenedShape, 'groupKey'> | null {
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

    return { points };
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
