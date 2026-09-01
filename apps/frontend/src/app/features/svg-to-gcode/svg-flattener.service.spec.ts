import { FlattenedShape, FlattenedSubpath, SvgFlattenerService, groupSubpathsIntoEntities } from './svg-flattener.service';

/** Flattens every subpath's points into one array — enough for tests that only care about the
 * overall point set, not the subpath boundaries themselves. */
function shapePoints(shape: FlattenedShape) {
  return shape.subpaths.flatMap((subpath) => subpath.points);
}

/**
 * jsdom does not implement SVGGeometryElement (getTotalLength/getPointAtLength) nor
 * SVGGraphicsElement.getCTM, so these are stubbed for the duration of each test. The
 * stub returns a fixed length of 10 for every element and a per-tag CTM translation,
 * which is enough to verify traversal order, skip rules and matrix application without
 * a real browser SVG engine.
 */
describe('SvgFlattenerService', () => {
  let service: SvgFlattenerService;

  function makePoint(x: number, y: number) {
    return {
      x,
      y,
      matrixTransform(matrix: { e: number; f: number }) {
        return makePoint(x + matrix.e, y + matrix.f);
      },
    };
  }

  beforeEach(() => {
    service = new SvgFlattenerService();

    (Element.prototype as unknown as Record<string, unknown>)['getTotalLength'] = function (
      this: Element,
    ) {
      return this.getAttribute('data-length') === '0' ? 0 : 10;
    };
    (Element.prototype as unknown as Record<string, unknown>)['getPointAtLength'] = function (
      this: Element,
      length: number,
    ) {
      return makePoint(length, 0);
    };
    (Element.prototype as unknown as Record<string, unknown>)['getCTM'] = function (
      this: Element,
    ) {
      const offsets: Record<string, { e: number; f: number }> = {
        path: { e: 100, f: 0 },
        rect: { e: 0, f: 0 },
      };
      const offset = offsets[this.tagName.toLowerCase()] ?? { e: 0, f: 0 };
      return { a: 1, b: 0, c: 0, d: 1, ...offset };
    };
  });

  afterEach(() => {
    delete (Element.prototype as unknown as Record<string, unknown>)['getTotalLength'];
    delete (Element.prototype as unknown as Record<string, unknown>)['getPointAtLength'];
    delete (Element.prototype as unknown as Record<string, unknown>)['getCTM'];
  });

  it('reads dimensions from the viewBox', () => {
    const result = service.flatten('doc-1', '<svg viewBox="0 0 100 50"><rect/></svg>', 'fallback.svg');
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });

  it('falls back to width/height attributes, then to 100x100', () => {
    const withAttrs = service.flatten('doc-1', '<svg width="40" height="20"><rect/></svg>', 'fallback.svg');
    expect(withAttrs).toMatchObject({ width: 40, height: 20 });

    const withNeither = service.flatten('doc-1', '<svg><rect/></svg>', 'fallback.svg');
    expect(withNeither).toMatchObject({ width: 100, height: 100 });
  });

  it('descends into groups and applies each element CTM, in document order', () => {
    const result = service.flatten(
      'doc-1',
      `
      <svg viewBox="0 0 200 100">
        <g><path d="M0 0 L10 0" /></g>
        <rect x="0" y="0" width="5" height="5" />
      </svg>
    `,
      'fallback.svg',
    );

    expect(result.shapes).toHaveLength(2);
    expect(shapePoints(result.shapes[0]).every((p) => p.x >= 100)).toBe(true);
    expect(shapePoints(result.shapes[1]).every((p) => p.x <= 10)).toBe(true);
  });

  it('skips zero-length shapes', () => {
    const result = service.flatten(
      'doc-1',
      '<svg viewBox="0 0 10 10"><rect data-length="0" /></svg>',
      'fallback.svg',
    );
    expect(result.shapes).toHaveLength(0);
  });

  it('ignores defs/clipPath/mask/symbol contents without flagging them as skipped', () => {
    const result = service.flatten(
      'doc-1',
      `
      <svg viewBox="0 0 100 100">
        <defs><path d="M0 0 L1 1" /></defs>
        <clipPath id="c"><rect /></clipPath>
      </svg>
    `,
      'fallback.svg',
    );

    expect(result.shapes).toHaveLength(0);
    expect(result.skippedTags).toHaveLength(0);
  });

  it('flags unsupported visible elements as skipped', () => {
    const result = service.flatten(
      'doc-1',
      `
      <svg viewBox="0 0 100 100">
        <text>hello</text>
        <use href="#missing" />
      </svg>
    `,
      'fallback.svg',
    );

    expect(result.skippedTags.sort()).toEqual(['text', 'use']);
  });

  it('throws on invalid SVG input', () => {
    expect(() => service.flatten('doc-1', '<div>not an svg</div>', 'fallback.svg')).toThrow(
      'This file does not contain a valid SVG.',
    );
  });

  describe('tree', () => {
    it('uses the SVG title as the root label when present', () => {
      const result = service.flatten('doc-1', '<svg><title>My Drawing</title></svg>', 'fallback.svg');
      expect(result.tree.label).toBe('My Drawing');
      expect(result.tree.key).toBe('doc-1');
      expect(result.tree.data).toEqual({ documentId: 'doc-1', kind: 'document' });
    });

    it('falls back to the given label when the SVG has no title', () => {
      const result = service.flatten('doc-1', '<svg><rect/></svg>', 'fallback.svg');
      expect(result.tree.label).toBe('fallback.svg');
    });

    it('produces no children when the SVG has no groups', () => {
      const result = service.flatten('doc-1', '<svg><rect/><circle/></svg>', 'fallback.svg');
      expect(result.tree.children).toEqual([]);
    });

    it('creates one child node per top-level group, labelled from its own title', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><g><title>Outline</title><path d="M0 0 L1 1"/></g><g><rect/></g></svg>',
        'fallback.svg',
      );

      expect(result.tree.children).toHaveLength(2);
      expect(result.tree.children?.[0]).toMatchObject({ label: 'Outline', data: { kind: 'group' } });
      expect(result.tree.children?.[1]).toMatchObject({ label: 'Layer 1' });
    });

    it('numbers unlabelled layers with a single counter across the whole document', () => {
      const result = service.flatten('doc-1', '<svg><g><g></g></g><g></g></svg>', 'fallback.svg');

      expect(result.tree.children?.[0].label).toBe('Layer 1');
      expect(result.tree.children?.[0].children?.[0].label).toBe('Layer 2');
      expect(result.tree.children?.[1].label).toBe('Layer 3');
    });

    it('nests groups within groups recursively', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><g><title>Outer</title><g><title>Inner</title><path d="M0 0 L1 1"/></g></g></svg>',
        'fallback.svg',
      );

      expect(result.tree.children?.[0].label).toBe('Outer');
      expect(result.tree.children?.[0].children?.[0].label).toBe('Inner');
    });

    it('descends transparently through <a> and nested <svg> without creating nodes for them', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><a href="#"><g><title>Linked group</title></g></a><svg><g><title>Nested</title></g></svg></svg>',
        'fallback.svg',
      );

      expect(result.tree.children).toHaveLength(2);
      expect(result.tree.children?.map((c) => c.label)).toEqual(['Linked group', 'Nested']);
    });

    it('ignores groups defined only inside defs/clipPath/mask/pattern/symbol', () => {
      const result = service.flatten(
        'doc-1',
        `<svg>
          <defs><g><title>Definition</title></g></defs>
          <clipPath id="c"><g><title>Clip</title></g></clipPath>
        </svg>`,
        'fallback.svg',
      );

      expect(result.tree.children).toEqual([]);
    });

    it('assigns unique keys to every node', () => {
      const result = service.flatten('doc-1', '<svg><g></g><g><g></g></g></svg>', 'fallback.svg');
      const keys = new Set<string>();
      const collect = (node: typeof result.tree) => {
        keys.add(node.key as string);
        node.children?.forEach(collect);
      };
      collect(result.tree);
      expect(keys.size).toBe(4);
    });
  });

  describe('shape group keys', () => {
    it('tags a root-level shape with the document key', () => {
      const result = service.flatten('doc-1', '<svg><rect/></svg>', 'fallback.svg');
      expect(result.shapes[0].groupKey).toBe('doc-1');
    });

    it('tags a shape with its immediately enclosing group key', () => {
      const result = service.flatten('doc-1', '<svg><g><title>Outline</title><path d="M0 0 L1 1"/></g></svg>', 'fallback.svg');
      expect(result.shapes[0].groupKey).toBe(result.tree.children?.[0].key);
    });

    it('tags a shape in a nested group with the innermost group key', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><g><title>Outer</title><g><title>Inner</title><path d="M0 0 L1 1"/></g></g></svg>',
        'fallback.svg',
      );
      const outer = result.tree.children?.[0];
      const inner = outer?.children?.[0];
      expect(result.shapes[0].groupKey).toBe(inner?.key);
      expect(result.shapes[0].groupKey).not.toBe(outer?.key);
    });
  });

  describe('leaf-group merging (independent "hole" <path> siblings)', () => {
    it('merges every element of a group with no nested groups into a single shape', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><g><path d="M0,0 L10,0 L10,10 Z" /><path d="M20,20 L30,20 L30,30 Z" /></g></svg>',
        'fallback.svg',
      );

      expect(result.shapes).toHaveLength(1);
      expect(result.shapes[0].subpaths).toHaveLength(2);
      expect(result.shapes[0].groupKey).toBe(result.tree.children?.[0].key);
    });

    it('does not merge a group that has a nested group of its own', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><g><path d="M0,0 L10,0 L10,10 Z" /><g><path d="M20,20 L30,20 L30,30 Z" /></g></g></svg>',
        'fallback.svg',
      );

      // The outer path and the inner group's path stay two separate shapes.
      expect(result.shapes).toHaveLength(2);
      const outerKey = result.tree.children?.[0].key;
      const innerKey = result.tree.children?.[0].children?.[0].key;
      expect(result.shapes.map((s) => s.groupKey).sort()).toEqual([innerKey, outerKey].sort());
    });

    it('flags a shape as explodable when it has two unrelated (non-nested) closed subpaths', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><path d="M0,0 L10,0 L10,10 Z M100,100 L110,100 L110,110 Z" /></svg>',
        'fallback.svg',
      );

      expect(result.shapes).toHaveLength(1);
      expect(result.shapes[0].explodable).toBe(true);
    });

    it('does not flag a genuine outer-contour-plus-hole shape as explodable', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><path d="M0,0 L0,20 L20,20 L20,0 Z M5,5 L5,15 L15,15 L15,5 Z" /></svg>',
        'fallback.svg',
      );

      expect(result.shapes).toHaveLength(1);
      expect(result.shapes[0].explodable).toBe(false);
    });

    it('still merges mixed geometry tags (path + rect) in a leaf group', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><g><path d="M0,0 L10,0 L10,10 Z" /><rect x="0" y="0" width="5" height="5" /></g></svg>',
        'fallback.svg',
      );

      expect(result.shapes).toHaveLength(1);
      expect(result.shapes[0].subpaths).toHaveLength(2);
    });
  });

  describe('path line/curve sampling', () => {
    it('keeps straight-line commands (M/L/H/V/Z) exact, with no interpolation', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><path d="M0,0 L10,0 L10,10 H0 V0 Z" /></svg>',
        'fallback.svg',
      );

      // M, L, L, H, V, Z -> exactly one point per command, corners preserved as authored.
      // (+100 on x: the shared stub's CTM offsets <path> elements by e:100.)
      expect(result.shapes[0].subpaths).toEqual([
        {
          closed: true,
          points: [
            { x: 100, y: 0 },
            { x: 110, y: 0 },
            { x: 110, y: 10 },
            { x: 100, y: 10 },
            { x: 100, y: 0 },
            { x: 100, y: 0 },
          ],
        },
      ]);
    });

    it('interpolates curve commands (C) into several points instead of a single corner', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><path d="M0,0 C1,1 2,2 3,3 L4,4" /></svg>',
        'fallback.svg',
      );

      // M contributes 1 point, the stubbed 10-length curve is sampled into several more
      // (step 1.5 -> ceil(10/1.5) = 7), then L contributes exactly 1 more point.
      const points = result.shapes[0].subpaths[0].points;
      expect(points.length).toBeGreaterThan(3);
      expect(points[points.length - 1]).toEqual({ x: 104, y: 4 });
    });

    it('interpolates S/Q/T the same way as C', () => {
      for (const d of ['M0,0 S1,1 2,2', 'M0,0 Q1,1 2,2', 'M0,0 Q1,1 2,2 T4,4']) {
        const result = service.flatten('doc-1', `<svg><path d="${d}" /></svg>`, 'fallback.svg');
        expect(result.shapes[0].subpaths[0].points.length).toBeGreaterThan(2);
      }
    });

    it('applies the CTM to both line and curve points alike', () => {
      const result = service.flatten('doc-1', '<svg><path d="M0,0 L1,1 C2,2 3,3 4,4" /></svg>', 'fallback.svg');
      // The stub offsets <path> elements by e:100 — every point, line or curve, must carry it.
      expect(result.shapes[0].subpaths[0].points.every((p) => p.x >= 100)).toBe(true);
    });

    it('returns null for a path with no d attribute or a degenerate single-point path', () => {
      const noD = service.flatten('doc-1', '<svg><path /></svg>', 'fallback.svg');
      expect(noD.shapes).toHaveLength(0);

      const singlePoint = service.flatten('doc-1', '<svg><path d="M0,0" /></svg>', 'fallback.svg');
      expect(singlePoint.shapes).toHaveLength(0);
    });

    it('treats a subpath as closed when it repeats its start point via "L" instead of using "Z"', () => {
      // Some generators (FreeCAD, notably) close a loop by repeating the start point as a plain
      // line-to instead of emitting "Z" — this must still be recognized as closed, otherwise
      // fill-rule holes and laser-offset inward/outward both silently no-op on such a subpath.
      const result = service.flatten(
        'doc-1',
        '<svg><path d="M10,10 L20,10 L20,20 L10,20 L10,10" /></svg>',
        'fallback.svg',
      );

      expect(result.shapes[0].subpaths).toHaveLength(1);
      expect(result.shapes[0].subpaths[0].closed).toBe(true);
    });

    it('snaps an implicitly-closed subpath\'s last point to exactly match its first', () => {
      // A curve's sampled endpoint lands only *approximately* back on the start point (here the
      // stub returns (10, 0) for the curve's last sample, vs an M start of (10, 0.0005) — within
      // the "same point" epsilon but not bit-identical). Left as-is, that tiny gap is enough to
      // make polygon-offset's underlying Martinez clipping produce a badly corrupted ring (see
      // the laser-offset "expand-fail" bug report) — so it must be snapped exactly closed here.
      const result = service.flatten(
        'doc-1',
        '<svg><path d="M10,0.0005 Q5,5 5,5" /></svg>',
        'fallback.svg',
      );

      const subpath = result.shapes[0].subpaths[0];
      expect(subpath.closed).toBe(true);
      const last = subpath.points[subpath.points.length - 1];
      expect(last).toEqual(subpath.points[0]);
    });

    it('splits multiple M...Z segments of a single <path> into separate subpaths', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><path d="M0,0 L10,0 L10,10 Z M20,20 L30,20 L30,30 Z" /></svg>',
        'fallback.svg',
      );

      expect(result.shapes).toHaveLength(1);
      expect(result.shapes[0].subpaths).toHaveLength(2);
      expect(result.shapes[0].subpaths[0].closed).toBe(true);
      expect(result.shapes[0].subpaths[1].closed).toBe(true);
      expect(result.shapes[0].subpaths[1].points[0]).toEqual({ x: 120, y: 20 });
    });

    it('drops a degenerate (single-point) subpath but keeps the others in the same path', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><path d="M0,0 M5,5 L10,10 L10,0 Z" /></svg>',
        'fallback.svg',
      );

      expect(result.shapes[0].subpaths).toHaveLength(1);
      expect(result.shapes[0].subpaths[0].closed).toBe(true);
    });
  });
});

describe('groupSubpathsIntoEntities', () => {
  const square = (x: number, y: number, size: number, closed = true): FlattenedSubpath => ({
    points: [
      { x, y },
      { x, y: y + size },
      { x: x + size, y: y + size },
      { x: x + size, y },
      { x, y },
    ],
    closed,
  });

  it('keeps a single subpath as one entity', () => {
    expect(groupSubpathsIntoEntities([square(0, 0, 10)])).toHaveLength(1);
  });

  it('groups a hole together with its outer contour as one entity', () => {
    const outer = square(0, 0, 20);
    const hole = square(5, 5, 5);
    const entities = groupSubpathsIntoEntities([outer, hole]);

    expect(entities).toHaveLength(1);
    expect(entities[0]).toHaveLength(2);
  });

  it('treats two non-nested closed subpaths as separate entities', () => {
    const a = square(0, 0, 10);
    const b = square(100, 100, 10);
    const entities = groupSubpathsIntoEntities([a, b]);

    expect(entities).toHaveLength(2);
    expect(entities.map((entity) => entity.length)).toEqual([1, 1]);
  });

  it('groups a nested island-within-hole-within-outer chain as one entity', () => {
    const outer = square(0, 0, 30);
    const hole = square(5, 5, 20);
    const island = square(10, 10, 5);
    const entities = groupSubpathsIntoEntities([outer, hole, island]);

    expect(entities).toHaveLength(1);
    expect(entities[0]).toHaveLength(3);
  });

  it('treats every open subpath as its own entity', () => {
    const openA: FlattenedSubpath = { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: false };
    const openB: FlattenedSubpath = { points: [{ x: 2, y: 2 }, { x: 3, y: 3 }], closed: false };
    const entities = groupSubpathsIntoEntities([openA, openB]);

    expect(entities).toHaveLength(2);
  });
});
