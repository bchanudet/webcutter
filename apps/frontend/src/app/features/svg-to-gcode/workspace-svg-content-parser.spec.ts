import { isWorkspaceSvg, parseWorkspaceContent } from './workspace-svg-content-parser';

const PLAIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8"/></svg>';

const workspaceSvg = (options: {
  width?: number;
  height?: number;
  profiles?: string;
  material?: string;
  paths?: string;
}) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${options.width ?? 100}mm" height="${options.height ?? 100}mm" viewBox="0 0 ${options.width ?? 100} ${options.height ?? 100}">
  <metadata>
    <webcutter xmlns="https://webcutter.infogones.com/ns/workspace">
      <version>1</version>
      <profiles>${options.profiles ?? ''}</profiles>
      ${options.material ?? ''}
    </webcutter>
  </metadata>
  <g id="content">${options.paths ?? ''}</g>
</svg>`;

const PROFILE_XML =
  '<profile id="p1" materialId="m1" name="Cut" color="#ff0000" type="LINE" powerPercent="80" speedMmPerMin="600" passes="1" />';
const MATERIAL_XML = '<material id="m1" name="Plywood" thicknessMm="3" />';

describe('isWorkspaceSvg', () => {
  it('returns true for an SVG with a <webcutter> metadata block', () => {
    expect(isWorkspaceSvg(workspaceSvg({}))).toBe(true);
  });

  it('returns false for a plain third-party SVG', () => {
    expect(isWorkspaceSvg(PLAIN_SVG)).toBe(false);
  });

  it('returns false for unparsable markup', () => {
    expect(isWorkspaceSvg('not xml at all <<<')).toBe(false);
  });
});

describe('parseWorkspaceContent', () => {
  it('returns null for a non-workspace SVG', () => {
    expect(parseWorkspaceContent(PLAIN_SVG, 'doc-0', 'test.svg')).toBeNull();
  });

  it('reads the surface size from the viewBox', () => {
    const result = parseWorkspaceContent(workspaceSvg({ width: 150, height: 80 }), 'doc-0', 'test.svg');
    expect(result?.width).toBe(150);
    expect(result?.height).toBe(80);
  });

  it('parses a single flat path into one shape with its own group key', () => {
    const paths = '<path id="a" d="M 0 0 L 10 0 L 10 10 L 0 10 Z" transform="matrix(1 0 0 1 0 0)" profile="" />';
    const result = parseWorkspaceContent(workspaceSvg({ paths }), 'doc-0', 'test.svg');

    expect(result?.shapes).toHaveLength(1);
    const [shape] = result?.shapes ?? [];
    // "Z" only marks the subpath closed — it doesn't append a closing point that repeats the
    // start (same convention as the backend's workspace-svg-parser.ts).
    expect(shape.subpaths).toEqual([
      { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], closed: true },
    ]);
    expect(result?.tree.children).toHaveLength(1);
    expect(result?.tree.children?.[0].key).toBe(shape.groupKey);
  });

  it('bakes the matrix transform directly into the shape\'s points', () => {
    const paths = '<path id="a" d="M 0 0 L 10 0" transform="matrix(1 0 0 1 5 7)" />';
    const result = parseWorkspaceContent(workspaceSvg({ paths }), 'doc-0', 'test.svg');

    expect(result?.shapes[0].subpaths[0].points).toEqual([
      { x: 5, y: 7 },
      { x: 15, y: 7 },
    ]);
  });

  it('keeps multiple subpaths of a single path separate (e.g. an outline plus a hole)', () => {
    const paths = '<path id="a" d="M 0 0 L 10 0 L 10 10 Z M 2 2 L 8 2 L 8 8 Z" transform="matrix(1 0 0 1 0 0)" />';
    const result = parseWorkspaceContent(workspaceSvg({ paths }), 'doc-0', 'test.svg');

    expect(result?.shapes).toHaveLength(1);
    expect(result?.shapes[0].subpaths).toHaveLength(2);
  });

  it('creates one shape and one tree node per content path, each independently selectable', () => {
    const paths =
      '<path id="a" d="M 0 0 L 1 0" transform="matrix(1 0 0 1 0 0)" />' +
      '<path id="b" d="M 5 5 L 6 5" transform="matrix(1 0 0 1 0 0)" />';
    const result = parseWorkspaceContent(workspaceSvg({ paths }), 'doc-0', 'test.svg');

    expect(result?.shapes).toHaveLength(2);
    expect(result?.tree.children).toHaveLength(2);
    expect(new Set(result?.shapes.map((s) => s.groupKey)).size).toBe(2);
  });

  it('parses <profiles>/<material> and resolves each path\'s profile id, without assigning anything itself', () => {
    const paths = `<path id="a" d="M 0 0 L 1 0" transform="matrix(1 0 0 1 0 0)" profile="p1" />`;
    const result = parseWorkspaceContent(
      workspaceSvg({ paths, profiles: PROFILE_XML, material: MATERIAL_XML }),
      'doc-0',
      'test.svg',
    );

    expect(result?.material).toEqual({ id: 'm1', name: 'Plywood', thicknessMm: 3 });
    expect(result?.profiles.get('p1')).toMatchObject({ id: 'p1', name: 'Cut', powerPercent: 80 });
    expect(result?.shapeProfileIds).toEqual(['p1']);
  });

  it('resolves a path with no profile attribute to null in shapeProfileIds', () => {
    const paths = '<path id="a" d="M 0 0 L 1 0" transform="matrix(1 0 0 1 0 0)" />';
    const result = parseWorkspaceContent(workspaceSvg({ paths }), 'doc-0', 'test.svg');

    expect(result?.shapeProfileIds).toEqual([null]);
  });

  it('skips a path whose d contains anything other than M/L/Z (never produced by this app, but defensive)', () => {
    const paths =
      '<path id="a" d="M 0 0 C 1 1 2 2 3 3" transform="matrix(1 0 0 1 0 0)" />' +
      '<path id="b" d="M 5 5 L 6 5" transform="matrix(1 0 0 1 0 0)" />';
    const result = parseWorkspaceContent(workspaceSvg({ paths }), 'doc-0', 'test.svg');

    expect(result?.shapes).toHaveLength(1);
    expect(result?.shapes[0].id).toContain('doc-0');
  });
});
