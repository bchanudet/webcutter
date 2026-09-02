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
          message: `Le path "${path.id}" contient une commande "${path.unsupportedCommand}" (courbe ou arc) — seuls les segments de ligne droite (M/L) sont supportés.`,
          pathIds: [path.id],
        });
      }

      if (path.profileId === null) {
        errors.push({
          code: 'MISSING_PROFILE',
          message: `Le path "${path.id}" n'a aucun profil assigné.`,
          pathIds: [path.id],
        });
        continue;
      }

      const profile = workspace.profiles.find((candidate) => candidate.id === path.profileId);
      if (!profile) {
        errors.push({
          code: 'UNKNOWN_PROFILE',
          message: `Le path "${path.id}" référence un profil inconnu (id=${path.rawProfileAttr}).`,
          pathIds: [path.id],
        });
        continue;
      }

      if (!workspace.material) {
        pathIdsMissingMaterial.push(path.id);
      } else if (profile.materialId !== workspace.material.id) {
        errors.push({
          code: 'PROFILE_MATERIAL_MISMATCH',
          message: `Le path "${path.id}" utilise le profil "${profile.name}" (id=${profile.id}), qui n'appartient pas au matériau sélectionné ("${workspace.material.name}", id=${workspace.material.id}).`,
          pathIds: [path.id],
        });
      }
    }

    if (pathIdsMissingMaterial.length > 0) {
      errors.push({
        code: 'NO_MATERIAL_SELECTED',
        message: `Aucun matériau n'est sélectionné pour ce document, alors que ${pathIdsMissingMaterial.length} path(s) référencent un profil.`,
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
          message: `Le path "${path.id}" dépasse de la surface de découpe (${workspace.width} x ${workspace.height} mm).`,
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
            message: `Les paths "${a.id}" et "${b.id}" se croisent.`,
            pathIds: [a.id, b.id],
          });
        }
      }
    }

    return errors;
  }
}
