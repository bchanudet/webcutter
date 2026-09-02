import { Gcode, GcodeHook } from '../gcode/entities/gcode.entity';
import { GcodeService } from '../gcode/gcode.service';
import { Machine } from '../machine/entities/machine.entity';
import { MachineService } from '../machine/machine.service';
import { WorkspaceCheckService } from './workspace-check.service';
import { WorkspaceGcodeGeneratorService } from './workspace-gcode-generator.service';

const HEADER = (width: number, height: number) => `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">`;

interface ProfileFixture {
  id: number;
  materialId: number;
  name?: string;
  mode?: 'LINE' | 'FILL';
  powerPercent?: number;
  speedMmPerSec?: number;
  passes?: number;
  lineSpacingMm?: number | null;
}

const metadata = (options: { profiles?: ProfileFixture[]; material?: { id: number; name?: string } }) => {
  const profiles = (options.profiles ?? [])
    .map(
      (profile) =>
        `<profile id="${profile.id}" materialId="${profile.materialId}" name="${profile.name ?? 'P'}" color="#ff0000" type="${profile.mode ?? 'LINE'}" powerPercent="${profile.powerPercent ?? 100}" speedMmPerSec="${profile.speedMmPerSec ?? 10}" passes="${profile.passes ?? 1}"${profile.lineSpacingMm != null ? ` lineSpacingMm="${profile.lineSpacingMm}"` : ''}/>`,
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

const makeMachine = (sMax: number): Machine => ({ sMax } as Machine);

const makeHook = (hook: GcodeHook, order: number, code: string): Gcode =>
  ({ id: order, name: `${hook}-${order}`, hook, order, code, createdAt: new Date(), updatedAt: new Date() }) as Gcode;

describe('WorkspaceGcodeGeneratorService', () => {
  let machineService: { get: jest.Mock };
  let gcodeService: { findAll: jest.Mock };
  let service: WorkspaceGcodeGeneratorService;

  beforeEach(() => {
    machineService = { get: jest.fn().mockResolvedValue(makeMachine(1000)) };
    gcodeService = { findAll: jest.fn().mockResolvedValue([]) };
    service = new WorkspaceGcodeGeneratorService(
      new WorkspaceCheckService(),
      machineService as unknown as MachineService,
      gcodeService as unknown as GcodeService,
    );
  });

  it('returns validation errors and no gcode without touching machine/gcode services', async () => {
    const svg = svgDoc(100, 100, metadata({}), [path({ id: 'a', d: SQUARE_10 })]);

    const result = await service.generate(svg);

    expect(result.gcode).toBeNull();
    expect(result.errors).toEqual([expect.objectContaining({ code: 'MISSING_PROFILE' })]);
    expect(machineService.get).not.toHaveBeenCalled();
    expect(gcodeService.findAll).not.toHaveBeenCalled();
  });

  it('reports a FILL profile with no usable lineSpacingMm instead of generating gcode', async () => {
    const svg = svgDoc(
      100,
      100,
      metadata({ profiles: [{ id: 1, materialId: 5, mode: 'FILL', lineSpacingMm: null }], material: { id: 5 } }),
      [path({ id: 'a', d: SQUARE_10, profile: 1 })],
    );

    const result = await service.generate(svg);

    expect(result.gcode).toBeNull();
    expect(result.errors).toEqual([expect.objectContaining({ code: 'INVALID_LINE_SPACING', pathIds: ['a'] })]);
  });

  it('wraps the program with $H, sorted start/end hooks, and a trailing M5', async () => {
    gcodeService.findAll.mockResolvedValue([
      makeHook(GcodeHook.END, 2, 'END-TWO'),
      makeHook(GcodeHook.START, 2, 'START-TWO'),
      makeHook(GcodeHook.END, 1, 'END-ONE'),
      makeHook(GcodeHook.START, 1, 'START-ONE'),
    ]);
    const svg = svgDoc(
      100,
      100,
      metadata({ profiles: [{ id: 1, materialId: 5 }], material: { id: 5 } }),
      [path({ id: 'a', d: SQUARE_10, profile: 1 })],
    );

    const result = await service.generate(svg);

    expect(result.errors).toEqual([]);
    const lines = result.gcode?.split('\n') ?? [];
    expect(lines[0]).toBe('$H');
    const startOneIndex = lines.indexOf('START-ONE');
    const startTwoIndex = lines.indexOf('START-TWO');
    const endOneIndex = lines.indexOf('END-ONE');
    const endTwoIndex = lines.indexOf('END-TWO');
    expect(startOneIndex).toBeGreaterThan(0);
    expect(startTwoIndex).toBeGreaterThan(startOneIndex);
    expect(endOneIndex).toBeGreaterThan(startTwoIndex);
    expect(endTwoIndex).toBeGreaterThan(endOneIndex);
    expect(lines[lines.length - 1]).toBe('M5');
  });

  it('derives S from powerPercent/sMax and F from speedMmPerSec x 60 for a LINE profile', async () => {
    machineService.get.mockResolvedValue(makeMachine(1000));
    const svg = svgDoc(
      100,
      100,
      metadata({ profiles: [{ id: 1, materialId: 5, powerPercent: 50, speedMmPerSec: 10 }], material: { id: 5 } }),
      [path({ id: 'a', d: SQUARE_10, profile: 1 })],
    );

    const result = await service.generate(svg);

    expect(result.gcode).toContain('M4 S500');
    expect(result.gcode).toContain('F600');
  });

  it('repeats a path once per pass and closes a closed subpath back to its start', async () => {
    const svg = svgDoc(
      100,
      100,
      metadata({ profiles: [{ id: 1, materialId: 5, passes: 3 }], material: { id: 5 } }),
      [path({ id: 'a', d: SQUARE_10, profile: 1 })],
    );

    const result = await service.generate(svg);
    const gcode = result.gcode as string;

    // 3 passes each end with their own M5, plus the program's own trailing M5.
    expect(gcode.match(/^M5$/gm)?.length).toBe(4);
    // The last G1 of each pass returns to the square's starting point (0, 10) once flipped to
    // GRBL's Y-up convention (bed height 100 - svg y 0 = 100).
    expect(gcode.match(/G1 X0\.000 Y100\.000 F600/g)?.length).toBe(3);
  });

  it('generates a 45° hatch fill for a FILL-mode profile', async () => {
    const svg = svgDoc(
      100,
      100,
      metadata({
        profiles: [{ id: 1, materialId: 5, mode: 'FILL', lineSpacingMm: 2, passes: 1 }],
        material: { id: 5 },
      }),
      [path({ id: 'a', d: SQUARE_10, profile: 1 })],
    );

    const result = await service.generate(svg);
    const gcode = result.gcode as string;

    expect(result.errors).toEqual([]);
    expect(gcode).toContain('fill pass 1/1');
    // A 10x10 square filled every 2mm produces several distinct hatch moves.
    expect(gcode.match(/^G0 /gm)?.length).toBeGreaterThan(2);
  });
});
