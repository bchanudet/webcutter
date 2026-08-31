import { SvgFlattenerService } from './svg-flattener.service';

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
    expect(result.shapes[0].points.every((p) => p.x >= 100)).toBe(true);
    expect(result.shapes[1].points.every((p) => p.x <= 10)).toBe(true);
  });

  it('skips zero-length shapes', () => {
    const result = service.flatten(
      'doc-1',
      '<svg viewBox="0 0 10 10"><path data-length="0" d="M0 0" /></svg>',
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
        '<svg><g><title>Outline</title><path d="M0 0"/></g><g><rect/></g></svg>',
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
        '<svg><g><title>Outer</title><g><title>Inner</title><path d="M0 0"/></g></g></svg>',
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
      const result = service.flatten('doc-1', '<svg><g><title>Outline</title><path d="M0 0"/></g></svg>', 'fallback.svg');
      expect(result.shapes[0].groupKey).toBe(result.tree.children?.[0].key);
    });

    it('tags a shape in a nested group with the innermost group key', () => {
      const result = service.flatten(
        'doc-1',
        '<svg><g><title>Outer</title><g><title>Inner</title><path d="M0 0"/></g></g></svg>',
        'fallback.svg',
      );
      const outer = result.tree.children?.[0];
      const inner = outer?.children?.[0];
      expect(result.shapes[0].groupKey).toBe(inner?.key);
      expect(result.shapes[0].groupKey).not.toBe(outer?.key);
    });
  });
});
