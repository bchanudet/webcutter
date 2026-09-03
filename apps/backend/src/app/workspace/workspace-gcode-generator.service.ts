import { Injectable } from '@nestjs/common';
import { Gcode, GcodeHook } from '../gcode/entities/gcode.entity';
import { GcodeService } from '../gcode/gcode.service';
import { Machine } from '../machine/entities/machine.entity';
import { MachineService } from '../machine/machine.service';
import { computeHatchSegments } from './hatch-fill';
import { PathWithGeometry, WorkspaceCheckError, WorkspaceCheckService } from './workspace-check.service';
import { ParsedProfile, ParsedWorkspace, Point, parseWorkspaceSvg } from './workspace-svg-parser';

export interface WorkspaceGenerateResult {
  errors: WorkspaceCheckError[];
  /** `null` whenever `errors` isn't empty — g-code is only ever generated for a workspace that
   * passes every check. */
  gcode: string | null;
}

const formatCoordinate = (value: number): string => value.toFixed(3);

@Injectable()
export class WorkspaceGcodeGeneratorService {
  constructor(
    private readonly workspaceCheck: WorkspaceCheckService,
    private readonly machineService: MachineService,
    private readonly gcodeService: GcodeService,
  ) {}

  /** Validates a workspace SVG exactly like `WorkspaceCheckService.check()` (plus one
   * generation-only rule — see `INVALID_LINE_SPACING`), and only then turns it into a full
   * g-code program: `$H`, the "start" hooks in order, every path's own cutting/engraving moves,
   * the "end" hooks in order, and a final `M5`. Throws (caller turns it into a 400) only when the
   * SVG itself can't be parsed at all — business-rule violations come back as `errors`, not as a
   * thrown exception. */
  async generate(svgText: string): Promise<WorkspaceGenerateResult> {
    const workspace = parseWorkspaceSvg(svgText);
    const errors = [...this.workspaceCheck.checkParsed(workspace), ...this.findFillProfileErrors(workspace)];
    if (errors.length > 0) {
      return { errors, gcode: null };
    }

    const [machine, hooks] = await Promise.all([this.machineService.get(), this.gcodeService.findAll()]);

    const lines: string[] = [];
    lines.push(...this.hookCode(hooks, GcodeHook.START));
    for (const path of workspace.paths as PathWithGeometry[]) {
      const profile = workspace.profiles.find((candidate) => candidate.id === path.profileId) as ParsedProfile;
      lines.push(`; Path ${path.id} — profile "${profile.name}" (${profile.mode})`);
      lines.push(
        ...(profile.mode === 'FILL'
          ? this.generateFillCommands(path, profile, machine, workspace)
          : this.generateLineCommands(path, profile, machine, workspace)),
      );
    }
    lines.push(...this.hookCode(hooks, GcodeHook.END));
    lines.push('M5');

    return { errors: [], gcode: lines.join('\n') };
  }

  /** A FILL-mode profile needs a positive `lineSpacingMm` to produce any hatch line at all — not
   * one of `WorkspaceCheckService`'s rules (it only matters for generation), so it's checked here
   * and reported through the same `WorkspaceCheckError` shape. */
  private findFillProfileErrors(workspace: ParsedWorkspace): WorkspaceCheckError[] {
    const errors: WorkspaceCheckError[] = [];
    for (const path of workspace.paths) {
      if (path.profileId === null) continue;
      const profile = workspace.profiles.find((candidate) => candidate.id === path.profileId);
      if (profile?.mode === 'FILL' && !(profile.lineSpacingMm != null && profile.lineSpacingMm > 0)) {
        errors.push({
          code: 'INVALID_LINE_SPACING',
          message: `Le path "${path.id}" utilise le profil "${profile.name}" (mode FILL) sans espacement de lignes (lineSpacingMm) valide.`,
          pathIds: [path.id],
        });
      }
    }
    return errors;
  }

  private hookCode(hooks: Gcode[], hook: GcodeHook): string[] {
    return hooks
      .filter((candidate) => candidate.hook === hook)
      .sort((a, b) => a.order - b.order)
      .map((candidate) => candidate.code);
  }

  /** Converts a point already in bed-mm space (top-left origin, Y down, per
   * docs/workspace-svg-format.md) into GRBL's own Y-up convention. */
  private toMachinePoint(point: Point, workspace: ParsedWorkspace): Point {
    return { x: point.x, y: workspace.height - point.y };
  }

  private laserPowerValue(profile: ParsedProfile, machine: Machine): number {
    return Math.round((profile.powerPercent / 100) * machine.sMax);
  }

  private feedRate(profile: ParsedProfile): number {
    return Math.round(profile.speedMmPerSec * 60);
  }

  /** One G0 rapid + M4 (dynamic power) + a run of G1 moves + M5, per subpath, repeated
   * `profile.passes` times — a closed subpath gets an extra move back to its start so the cut
   * actually completes the loop (the flattened point list itself never repeats the first point). */
  private generateLineCommands(
    path: PathWithGeometry,
    profile: ParsedProfile,
    machine: Machine,
    workspace: ParsedWorkspace,
  ): string[] {
    const lines: string[] = [];
    const power = this.laserPowerValue(profile, machine);
    const feed = this.feedRate(profile);

    for (let pass = 1; pass <= profile.passes; pass++) {
      lines.push(`; ${path.id} — pass ${pass}/${profile.passes}`);
      for (const subpath of path.subpaths) {
        const points = subpath.points.map((point) => this.toMachinePoint(point, workspace));
        if (subpath.closed && points.length > 1) {
          points.push(points[0]);
        }
        const [start, ...rest] = points;
        if (!start || rest.length === 0) continue;

        lines.push(`G0 X${formatCoordinate(start.x)} Y${formatCoordinate(start.y)}`);
        lines.push(`M4 S${power}`);
        for (const point of rest) {
          lines.push(`G1 X${formatCoordinate(point.x)} Y${formatCoordinate(point.y)} F${feed}`);
        }
        lines.push('M5');
      }
    }
    return lines;
  }

  /** Same power/feed/passes handling as `generateLineCommands`, but the moves are the 45° hatch
   * segments from `computeHatchSegments` instead of the shape's own outline. */
  private generateFillCommands(
    path: PathWithGeometry,
    profile: ParsedProfile,
    machine: Machine,
    workspace: ParsedWorkspace,
  ): string[] {
    const lines: string[] = [];
    const power = this.laserPowerValue(profile, machine);
    const feed = this.feedRate(profile);
    // `findFillProfileErrors` already guarantees this is a positive number by the time we get here.
    const segments = computeHatchSegments(path.subpaths, profile.lineSpacingMm as number);

    for (let pass = 1; pass <= profile.passes; pass++) {
      lines.push(`; ${path.id} — fill pass ${pass}/${profile.passes}`);
      for (const segment of segments) {
        const start = this.toMachinePoint(segment.start, workspace);
        const end = this.toMachinePoint(segment.end, workspace);
        lines.push(`G0 X${formatCoordinate(start.x)} Y${formatCoordinate(start.y)}`);
        lines.push(`M4 S${power}`);
        lines.push(`G1 X${formatCoordinate(end.x)} Y${formatCoordinate(end.y)} F${feed}`);
        lines.push('M5');
      }
    }
    return lines;
  }
}
