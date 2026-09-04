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

/** Below this travel distance, a G0 between two consecutive FILL hatch segments no longer turns
 * the laser off at all (see `generateFillCommands`) — a steep, small hatch-filled area (e.g. a
 * text glyph, all short curvy segments) otherwise turns the laser on/off for every single one,
 * which cuts a visibly dotted line and jolts the motors on every start/stop. Starting value from
 * a first physical-machine test; tune from there. */
const MIN_TRAVEL_DISTANCE_MM = 0.5;

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

@Injectable()
export class WorkspaceGcodeGeneratorService {
  constructor(
    private readonly workspaceCheck: WorkspaceCheckService,
    private readonly machineService: MachineService,
    private readonly gcodeService: GcodeService,
  ) {}

  /** Validates a workspace SVG exactly like `WorkspaceCheckService.check()` (plus one
   * generation-only rule — see `INVALID_LINE_SPACING`), and only then turns it into a full
   * g-code program: the "start" hooks in order, every path's own cutting/engraving moves, the
   * "end" hooks in order, and a final `M30` — GRBL's own program-end, which (unlike a plain `M5`)
   * also resets modal state and lets `end` hooks rely on everything (laser, spindle/fan relay,
   * etc.) actually being shut off. Deliberately does *not* start with `$H`: some external G-code
   * viewers reject it as an unsupported command, and the machine is already homed once before any
   * file is streamed to it (see `JobService.start()`) — embedding it here too would just make it
   * happen twice for a real job while still breaking viewer compatibility for a downloaded file.
   * Throws (caller turns it into a 400) only when the SVG itself can't be parsed at all —
   * business-rule violations come back as `errors`, not as a thrown exception. */
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
    lines.push('M30');

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
          message: `Path "${path.id}" uses profile "${profile.name}" (FILL mode) without a valid line spacing (lineSpacingMm).`,
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
   * docs/workspace-svg-format.md) into GRBL's own Y-up convention, then applies the machine's own
   * origin offset (`Machine.offsetXMm`/`offsetYMm`) — the fixed gap between GRBL's own homed
   * origin and this machine's logical (0, 0), added to every emitted X/Y so `G0 X0 Y0` in the
   * source design actually lands where `$H` really put the head. */
  private toMachinePoint(point: Point, workspace: ParsedWorkspace, machine: Machine): Point {
    return { x: point.x + machine.offsetXMm, y: workspace.height - point.y + machine.offsetYMm };
  }

  private laserPowerValue(profile: ParsedProfile, machine: Machine): number {
    return Math.round((profile.powerPercent / 100) * machine.sMax);
  }

  private feedRate(profile: ParsedProfile): number {
    return Math.round(profile.speedMmPerMin);
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
        const points = subpath.points.map((point) => this.toMachinePoint(point, workspace, machine));
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
   * segments from `computeHatchSegments` instead of the shape's own outline. Consecutive segments
   * closer than `MIN_TRAVEL_DISTANCE_MM` apart are bridged with a plain `G1` (at the travel feed
   * rate) instead of the usual `M5` / `G0` / `M4` — see that constant's own comment. */
  private generateFillCommands(
    path: PathWithGeometry,
    profile: ParsedProfile,
    machine: Machine,
    workspace: ParsedWorkspace,
  ): string[] {
    const lines: string[] = [];
    const power = this.laserPowerValue(profile, machine);
    const feed = this.feedRate(profile);
    const travelFeed = Math.round(Math.min(machine.travelSpeedXMmPerMin, machine.travelSpeedYMmPerMin));
    // `findFillProfileErrors` already guarantees this is a positive number by the time we get here.
    const segments = computeHatchSegments(path.subpaths, profile.lineSpacingMm as number);

    for (let pass = 1; pass <= profile.passes; pass++) {
      lines.push(`; ${path.id} — fill pass ${pass}/${profile.passes}`);
      let current: Point | null = null;

      // Power is constant through complete Fill path, so one M4 at the start is enough
      lines.push(`M4 S${power}`);

      for (const segment of segments) {
        const start = this.toMachinePoint(segment.start, workspace, machine);
        const end = this.toMachinePoint(segment.end, workspace, machine);

        if (current && distanceBetween(current, start) < MIN_TRAVEL_DISTANCE_MM) {
          lines.push(`G1 X${formatCoordinate(start.x)} Y${formatCoordinate(start.y)} F${travelFeed}`);
        } else {
          // G0 automatically turns the laser off, so no need for M5 / M4 shenanigans
          lines.push(`G0 X${formatCoordinate(start.x)} Y${formatCoordinate(start.y)}`);
        }

        lines.push(`G1 X${formatCoordinate(end.x)} Y${formatCoordinate(end.y)} F${feed}`);
        current = end;
      }

      if (current) {
        lines.push('M5');
      }
    }
    return lines;
  }
}
