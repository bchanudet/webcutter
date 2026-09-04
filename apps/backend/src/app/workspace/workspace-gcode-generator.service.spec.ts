import { SVG_NS, WEBCUTTER_NS } from '@webcutter/shared';
import { Gcode, GcodeHook } from '../gcode/entities/gcode.entity';
import { GcodeService } from '../gcode/gcode.service';
import { Machine } from '../machine/entities/machine.entity';
import { MachineService } from '../machine/machine.service';
import { WorkspaceCheckService } from './workspace-check.service';
import { WorkspaceGcodeGeneratorService } from './workspace-gcode-generator.service';

const HEADER = (width: number, height: number) => `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="${SVG_NS}" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">`;

interface ProfileFixture {
  id: number;
  materialId: number;
  name?: string;
  mode?: 'LINE' | 'FILL';
  powerPercent?: number;
  speedMmPerMin?: number;
  passes?: number;
  lineSpacingMm?: number | null;
}

const metadata = (options: { profiles?: ProfileFixture[]; material?: { id: number; name?: string } }) => {
  const profiles = (options.profiles ?? [])
    .map(
      (profile) =>
        `<profile id="${profile.id}" materialId="${profile.materialId}" name="${profile.name ?? 'P'}" color="#ff0000" type="${profile.mode ?? 'LINE'}" powerPercent="${profile.powerPercent ?? 100}" speedMmPerMin="${profile.speedMmPerMin ?? 600}" passes="${profile.passes ?? 1}"${profile.lineSpacingMm != null ? ` lineSpacingMm="${profile.lineSpacingMm}"` : ''}/>`,
    )
    .join('');
  const material = options.material
    ? `<material id="${options.material.id}" name="${options.material.name ?? 'M'}" thicknessMm="3"/>`
    : '';
  return `<metadata><webcutter xmlns="${WEBCUTTER_NS}"><version>1</version><profiles>${profiles}</profiles>${material}</webcutter></metadata>`;
};

const path = (options: { id: string; d: string; profile?: number; transform?: string }) =>
  `<path id="${options.id}" d="${options.d}" fill-rule="evenodd"${
    options.transform ? ` transform="${options.transform}"` : ''
  } fill="none" stroke="#000"${options.profile != null ? ` profile="${options.profile}"` : ''}/>`;

const svgDoc = (width: number, height: number, meta: string, paths: string[]) =>
  `${HEADER(width, height)}${meta}<g id="content">${paths.join('')}</g></svg>`;

const SQUARE_10 = 'M 0 0 L 10 0 L 10 10 L 0 10 Z';
const SQUARE_TINY = 'M 0 0 L 1 0 L 1 1 L 0 1 Z';

const makeMachine = (
  sMax: number,
  offsetXMm = 0,
  offsetYMm = 0,
  travelSpeedXMmPerMin = 6000,
  travelSpeedYMmPerMin = 6000,
): Machine => ({ sMax, offsetXMm, offsetYMm, travelSpeedXMmPerMin, travelSpeedYMmPerMin }) as Machine;

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

  it('wraps the program with sorted start/end hooks and a trailing M30 (no leading $H)', async () => {
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
    // No `$H` here — some external G-code viewers reject it, and the machine is already homed
    // once before any file is streamed to it (see `JobService.start()`) — so the very first line
    // is the first start hook, not a homing command.
    expect(lines[0]).toBe('START-ONE');
    const startOneIndex = lines.indexOf('START-ONE');
    const startTwoIndex = lines.indexOf('START-TWO');
    const endOneIndex = lines.indexOf('END-ONE');
    const endTwoIndex = lines.indexOf('END-TWO');
    expect(startOneIndex).toBe(0);
    expect(startTwoIndex).toBeGreaterThan(startOneIndex);
    expect(endOneIndex).toBeGreaterThan(startTwoIndex);
    expect(endTwoIndex).toBeGreaterThan(endOneIndex);
    expect(lines[lines.length - 1]).toBe('M30');
  });

  it('derives S from powerPercent/sMax and F directly from speedMmPerMin for a LINE profile', async () => {
    machineService.get.mockResolvedValue(makeMachine(1000));
    const svg = svgDoc(
      100,
      100,
      metadata({ profiles: [{ id: 1, materialId: 5, powerPercent: 50, speedMmPerMin: 600 }], material: { id: 5 } }),
      [path({ id: 'a', d: SQUARE_10, profile: 1 })],
    );

    const result = await service.generate(svg);

    expect(result.gcode).toContain('M4 S500');
    expect(result.gcode).toContain('F600');
  });

  it('applies the machine origin offset to every emitted X/Y coordinate', async () => {
    machineService.get.mockResolvedValue(makeMachine(1000, 5, -2));
    const svg = svgDoc(
      100,
      100,
      metadata({ profiles: [{ id: 1, materialId: 5 }], material: { id: 5 } }),
      [path({ id: 'a', d: SQUARE_10, profile: 1 })],
    );

    const result = await service.generate(svg);
    const gcode = result.gcode as string;

    // The square's own start point (0, 0) flips to (0, 100) under GRBL's Y-up convention, then
    // shifts by the machine's own origin offset (+5, -2).
    expect(gcode).toContain('G0 X5.000 Y98.000');
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

    // 3 passes each end with their own M5 — the program's own trailing line is `M30`, not `M5`.
    expect(gcode.match(/^M5$/gm)?.length).toBe(3);
    expect(gcode.trimEnd().endsWith('M30')).toBe(true);
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

  it('bridges fill segments closer than the minimum travel distance with a single G1, never turning the laser off', async () => {
    machineService.get.mockResolvedValue(makeMachine(1000, 0, 0, 9000, 9000));
    const svg = svgDoc(
      100,
      100,
      metadata({
        profiles: [{ id: 1, materialId: 5, mode: 'FILL', lineSpacingMm: 0.3, passes: 1 }],
        material: { id: 5 },
      }),
      // A 1x1mm square: every hatch line sits well within the 2mm threshold of its neighbours.
      [path({ id: 'a', d: SQUARE_TINY, profile: 1 })],
    );

    const result = await service.generate(svg);
    const gcode = result.gcode as string;

    expect(result.errors).toEqual([]);
    // Only the very first segment gets a real G0 (nothing to bridge from yet) and only the pass's
    // final M5 — every other hatch segment is bridged straight through with a G1, never a laser-off.
    expect(gcode.match(/^G0 /gm)?.length).toBe(1);
    expect(gcode.match(/^M5$/gm)?.length).toBe(1);
    expect(gcode).toContain('F9000');
  });

  it('sets F on every G0 to the smaller of the machine\'s own travel speeds, for both LINE and FILL profiles', async () => {
    // This Atomstack board keeps whatever F a previous G1 left behind for a G0 with none of its
    // own, instead of actually going full speed on a travel move — every G0 needs an explicit F.
    machineService.get.mockResolvedValue(makeMachine(1000, 0, 0, 9000, 7000));
    const svg = svgDoc(
      100,
      100,
      metadata({
        profiles: [
          { id: 1, materialId: 5, mode: 'LINE' },
          { id: 2, materialId: 5, mode: 'FILL', lineSpacingMm: 5 },
        ],
        material: { id: 5 },
      }),
      [
        path({ id: 'a', d: SQUARE_10, profile: 1 }),
        path({ id: 'b', d: SQUARE_10, profile: 2, transform: 'matrix(1 0 0 1 50 0)' }),
      ],
    );

    const result = await service.generate(svg);
    const gcode = result.gcode as string;

    expect(result.errors).toEqual([]);
    const g0Lines = gcode.split('\n').filter((line) => line.startsWith('G0 '));
    expect(g0Lines.length).toBeGreaterThan(1);
    expect(g0Lines.every((line) => line.endsWith('F7000'))).toBe(true);
  });

  it('emits a single M4 per fill pass and a plain G0 (GRBL cuts power on its own) for segments farther apart than the minimum travel distance', async () => {
    const svg = svgDoc(
      100,
      100,
      metadata({
        profiles: [{ id: 1, materialId: 5, mode: 'FILL', lineSpacingMm: 5, passes: 1 }],
        material: { id: 5 },
      }),
      // A 10x10mm square hatched every 5mm: consecutive scanlines are well over the 2mm threshold apart.
      [path({ id: 'a', d: SQUARE_10, profile: 1 })],
    );

    const result = await service.generate(svg);
    const gcode = result.gcode as string;

    // Several separate G0 travels (one per far-apart segment)...
    expect(gcode.match(/^G0 /gm)?.length).toBeGreaterThan(1);
    // ...but power stays constant through the whole fill, so a single M4 at the very start of the
    // pass is enough — no M4 re-issued per segment, and no mid-pass M5 either (a bare G0 already
    // cuts the laser on its own): only the pass's own trailing M5.
    expect(gcode.match(/^M4 /gm)?.length).toBe(1);
    expect(gcode.match(/^M5$/gm)?.length).toBe(1);
  });
});
