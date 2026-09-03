import { Injectable } from '@nestjs/common';
import { isWithinSurface, pathsIntersect } from './path-geometry';
import { ParsedPath, ParsedWorkspace, parseWorkspaceSvg, Subpath } from './workspace-svg-parser';

export type WorkspaceCheckErrorCode =
  | 'MISSING_PROFILE'
  | 'UNSUPPORTED_PATH_COMMAND'
  | 'UNKNOWN_PROFILE'
  | 'NO_MATERIAL_SELECTED'
  | 'PROFILE_MATERIAL_MISMATCH'
  | 'OUT_OF_BOUNDS'
  | 'PATH_INTERSECTION'
  /** Only ever emitted by `WorkspaceGcodeGeneratorService`, not by `check()` — a FILL-mode
   * profile with no usable `lineSpacingMm` can't produce a hatch fill. */
  | 'INVALID_LINE_SPACING';

export interface WorkspaceCheckError {
  code: WorkspaceCheckErrorCode;
  message: string;
  /** id(s) of the <path> element(s) this error is about — one, except for PATH_INTERSECTION. */
  pathIds: string[];
}

export type PathWithGeometry = ParsedPath & { subpaths: Subpath[] };

@Injectable()
export class WorkspaceCheckService {
  /** Parses and validates a workspace SVG (see docs/workspace-svg-format.md), returning every
   * rule violation found — an empty array means the file is ready for g-code generation. Throws
   * (caller turns it into a 400) only when the SVG itself can't be parsed at all. */
  check(svgText: string): WorkspaceCheckError[] {
    return this.checkParsed(parseWorkspaceSvg(svgText));
  }

  /** Same rules as `check()`, on an already-parsed workspace — reused by
   * `WorkspaceGcodeGeneratorService` so it doesn't parse the SVG twice. */
  checkParsed(workspace: ParsedWorkspace): WorkspaceCheckError[] {
    const errors: WorkspaceCheckError[] = [];
    const pathIdsMissingMaterial: string[] = [];

    for (const path of workspace.paths) {
      if (path.unsupportedCommand) {
        errors.push({
          code: 'UNSUPPORTED_PATH_COMMAND',
          message: `Path "${path.id}" contains a "${path.unsupportedCommand}" command (curve or arc) — only straight line segments (M/L) are supported.`,
          pathIds: [path.id],
        });
      }

      if (path.profileId === null) {
        errors.push({
          code: 'MISSING_PROFILE',
          message: `Path "${path.id}" has no profile assigned.`,
          pathIds: [path.id],
        });
        continue;
      }

      const profile = workspace.profiles.find((candidate) => candidate.id === path.profileId);
      if (!profile) {
        errors.push({
          code: 'UNKNOWN_PROFILE',
          message: `Path "${path.id}" references an unknown profile (id=${path.rawProfileAttr}).`,
          pathIds: [path.id],
        });
        continue;
      }

      if (!workspace.material) {
        pathIdsMissingMaterial.push(path.id);
      } else if (profile.materialId !== workspace.material.id) {
        errors.push({
          code: 'PROFILE_MATERIAL_MISMATCH',
          message: `Path "${path.id}" uses profile "${profile.name}" (id=${profile.id}), which doesn't belong to the selected material ("${workspace.material.name}", id=${workspace.material.id}).`,
          pathIds: [path.id],
        });
      }
    }

    if (pathIdsMissingMaterial.length > 0) {
      errors.push({
        code: 'NO_MATERIAL_SELECTED',
        message: `No material is selected for this document, yet ${pathIdsMissingMaterial.length} path(s) reference a profile.`,
        pathIds: pathIdsMissingMaterial,
      });
    }

    // Geometry-dependent checks only make sense for paths whose "d" was actually flattened —
    // one with an unsupported command already got its own UNSUPPORTED_PATH_COMMAND error above.
    const geometryPaths = workspace.paths.filter((path): path is PathWithGeometry => path.subpaths !== null);

    for (const path of geometryPaths) {
      if (!isWithinSurface(path.subpaths, workspace.width, workspace.height)) {
        errors.push({
          code: 'OUT_OF_BOUNDS',
          message: `Path "${path.id}" extends beyond the cutting surface (${workspace.width} x ${workspace.height} mm).`,
          pathIds: [path.id],
        });
      }
    }

    for (let i = 0; i < geometryPaths.length; i++) {
      for (let j = i + 1; j < geometryPaths.length; j++) {
        const a = geometryPaths[i];
        const b = geometryPaths[j];
        if (pathsIntersect(a.subpaths, b.subpaths)) {
          errors.push({
            code: 'PATH_INTERSECTION',
            message: `Paths "${a.id}" and "${b.id}" intersect.`,
            pathIds: [a.id, b.id],
          });
        }
      }
    }

    return errors;
  }
}
