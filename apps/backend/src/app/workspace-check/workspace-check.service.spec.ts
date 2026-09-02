import { WorkspaceCheckService } from './workspace-check.service';

const HEADER = (width: number, height: number) => `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">`;

const metadata = (options: {
  profiles?: { id: number; materialId: number; name?: string }[];
  material?: { id: number; name?: string };
}) => {
  const profiles = (options.profiles ?? [])
    .map(
      (profile) =>
        `<profile id="${profile.id}" materialId="${profile.materialId}" name="${profile.name ?? 'P'}" color="#ff0000" type="LINE" powerPercent="100" speedMmPerSec="10" passes="1"/>`,
    )
    .join('');
  const material = options.material
    ? `<material id="${options.material.id}" name="${options.material.name ?? 'M'}" thicknessMm="3"/>`
    : '';
  return `<metadata><webcutter xmlns="https://webcutter.infogones.com/ns/workspace"><version>1</version><profiles>${profiles}</profiles>${material}</webcutter></metadata>`;
};

const path = (options: { id: string; d: string; profile?: number; transform?: string }) =>
  `<path id="${options.id}" d="${options.d}" fill-rule="evenodd"${
    options.transform ? ` transform="${options.transform}"` : ''
  } fill="none" stroke="#000"${options.profile != null ? ` profile="${options.profile}"` : ''}/>`;

const svgDoc = (width: number, height: number, meta: string, paths: string[]) =>
  `${HEADER(width, height)}${meta}<g id="content">${paths.join('')}</g></svg>`;

const SQUARE_10 = 'M 0 0 L 10 0 L 10 10 L 0 10 Z';

describe('WorkspaceCheckService', () => {
  let service: WorkspaceCheckService;

  beforeEach(() => {
    service = new WorkspaceCheckService();
  });

  it('returns no error for a fully valid workspace', () => {
    const svg = svgDoc(
      100,
      100,
      metadata({ profiles: [{ id: 1, materialId: 5 }], material: { id: 5 } }),
      [path({ id: 'a', d: SQUARE_10, profile: 1 })],
    );

    expect(service.check(svg)).toEqual([]);
  });

  it('reports a path with no assigned profile', () => {
    const svg = svgDoc(100, 100, metadata({}), [path({ id: 'a', d: SQUARE_10 })]);

    const errors = service.check(svg);

    expect(errors).toEqual([
      expect.objectContaining({ code: 'MISSING_PROFILE', pathIds: ['a'] }),
    ]);
  });

  it('reports a curve/arc command instead of trying to flatten it', () => {
    const svg = svgDoc(100, 100, metadata({ profiles: [{ id: 1, materialId: 5 }], material: { id: 5 } }), [
      path({ id: 'a', d: 'M 0 0 C 1 1 2 2 3 3', profile: 1 }),
    ]);

    const errors = service.check(svg);

    expect(errors).toEqual([
      expect.objectContaining({ code: 'UNSUPPORTED_PATH_COMMAND', pathIds: ['a'] }),
    ]);
  });

  it('reports a profile referencing a material other than the one selected for the document', () => {
    const svg = svgDoc(
      100,
      100,
      metadata({ profiles: [{ id: 1, materialId: 9 }], material: { id: 5 } }),
      [path({ id: 'a', d: SQUARE_10, profile: 1 })],
    );

    const errors = service.check(svg);

    expect(errors).toEqual([
      expect.objectContaining({ code: 'PROFILE_MATERIAL_MISMATCH', pathIds: ['a'] }),
    ]);
  });

  it('reports an unknown profile id', () => {
    const svg = svgDoc(100, 100, metadata({ material: { id: 5 } }), [
      path({ id: 'a', d: SQUARE_10, profile: 42 }),
    ]);

    const errors = service.check(svg);

    expect(errors).toEqual([expect.objectContaining({ code: 'UNKNOWN_PROFILE', pathIds: ['a'] })]);
  });

  it('reports no material selected when a resolved profile has nothing to belong to', () => {
    const svg = svgDoc(100, 100, metadata({ profiles: [{ id: 1, materialId: 5 }] }), [
      path({ id: 'a', d: SQUARE_10, profile: 1 }),
    ]);

    const errors = service.check(svg);

    expect(errors).toEqual([
      expect.objectContaining({ code: 'NO_MATERIAL_SELECTED', pathIds: ['a'] }),
    ]);
  });

  it('reports a path that falls outside the cutting surface', () => {
    const svg = svgDoc(
      5,
      5,
      metadata({ profiles: [{ id: 1, materialId: 5 }], material: { id: 5 } }),
      [path({ id: 'a', d: SQUARE_10, profile: 1 })],
    );

    const errors = service.check(svg);

    expect(errors).toEqual([expect.objectContaining({ code: 'OUT_OF_BOUNDS', pathIds: ['a'] })]);
  });

  it('does not flag a path translated fully inside the surface via its transform matrix', () => {
    const svg = svgDoc(
      100,
      100,
      metadata({ profiles: [{ id: 1, materialId: 5 }], material: { id: 5 } }),
      [path({ id: 'a', d: SQUARE_10, profile: 1, transform: 'matrix(1 0 0 1 50 50)' })],
    );

    expect(service.check(svg)).toEqual([]);
  });

  it('reports two independent paths that cross each other', () => {
    const svg = svgDoc(
      100,
      100,
      metadata({ profiles: [{ id: 1, materialId: 5 }], material: { id: 5 } }),
      [
        path({ id: 'a', d: 'M 0 0 L 10 10', profile: 1 }),
        path({ id: 'b', d: 'M 0 10 L 10 0', profile: 1 }),
      ],
    );

    const errors = service.check(svg);

    expect(errors).toEqual([
      expect.objectContaining({ code: 'PATH_INTERSECTION', pathIds: ['a', 'b'] }),
    ]);
  });

  it('does not flag two independent paths that stay apart', () => {
    const svg = svgDoc(
      100,
      100,
      metadata({ profiles: [{ id: 1, materialId: 5 }], material: { id: 5 } }),
      [
        path({ id: 'a', d: SQUARE_10, profile: 1 }),
        path({ id: 'b', d: SQUARE_10, profile: 1, transform: 'matrix(1 0 0 1 50 50)' }),
      ],
    );

    expect(service.check(svg)).toEqual([]);
  });

  it('throws when the SVG has no <g id="content"> group', () => {
    const svg = `${HEADER(100, 100)}${metadata({})}</svg>`;

    expect(() => service.check(svg)).toThrow();
  });
});
