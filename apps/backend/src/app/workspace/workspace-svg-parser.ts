import { findChild, findDescendant, parseXml, XmlElement } from './xml-parser';

export interface Point {
  x: number;
  y: number;
}

export interface Subpath {
  points: Point[];
  closed: boolean;
}

export interface ParsedProfile {
  id: string;
  materialId: string;
  name: string;
  mode: 'LINE' | 'FILL';
  powerPercent: number;
  speedMmPerMin: number;
  passes: number;
  /** `null` when absent — only meaningful (and required) for a `FILL`-mode profile. */
  lineSpacingMm: number | null;
}

export interface ParsedMaterial {
  id: string;
  name: string;
}

export interface ParsedPath {
  /** The path's own `id` attribute — see docs/workspace-svg-format.md — used to name it in
   * check errors. */
  id: string;
  /** Raw `profile` attribute value, kept for error messages even when it doesn't resolve. */
  rawProfileAttr: string | null;
  profileId: string | null;
  /** Flattened, transform-applied geometry — `null` when the path couldn't be flattened because
   * it uses an unsupported command (see `unsupportedCommand`). */
  subpaths: Subpath[] | null;
  /** Set when the path's `d` contains anything other than M/L/Z — curves and arcs are rejected
   * rather than re-implemented here: the frontend's own flattener already turns every curve into
   * line segments before a workspace SVG is ever produced (see svg-flattener.service.ts), so a
   * conforming file never has one. */
  unsupportedCommand: string | null;
}

export interface ParsedWorkspace {
  width: number;
  height: number;
  profiles: ParsedProfile[];
  material: ParsedMaterial | null;
  paths: ParsedPath[];
}

function parseNumberAttr(element: XmlElement, name: string): number {
  const value = Number(element.attributes[name]);
  if (!Number.isFinite(value)) {
    throw new Error(`Attribut "${name}" invalide sur <${element.tagName}>.`);
  }
  return value;
}

/** Ids (profile/material) are opaque GUID strings — just required to be non-empty. */
function requireStringAttr(element: XmlElement, name: string): string {
  const value = element.attributes[name];
  if (!value) {
    throw new Error(`Attribut "${name}" invalide sur <${element.tagName}>.`);
  }
  return value;
}

function parseTransform(transform: string | undefined): (point: Point) => Point {
  if (!transform) {
    return (point) => point;
  }
  const match = /matrix\(\s*([^)]+)\)/.exec(transform);
  if (!match) {
    return (point) => point;
  }
  const parts = match[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 6 || parts.some((value) => !Number.isFinite(value))) {
    throw new Error(`Attribut "transform" invalide : "${transform}".`);
  }
  const [a, b, c, d, e, f] = parts;
  return (point) => ({ x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f });
}

/**
 * Parses a `<path d="...">` produced by `pathDataForSubpaths()` on the frontend: a sequence of
 * `M x y`, `L x y` and `Z` tokens, always whitespace-separated (see svg-to-gcode.page.ts). Any
 * other command letter (curves, arcs — upper or lower case) is reported back instead of being
 * flattened, per the "no curves" rule: reproducing bezier/arc math here is exactly what the
 * frontend's flattener exists to avoid needing twice.
 */
function parsePathData(d: string): { subpaths: Subpath[] } | { unsupportedCommand: string } {
  const tokens = d.trim().split(/\s+/).filter(Boolean);
  const subpaths: Subpath[] = [];
  let current: Point[] = [];
  let closed = false;
  let i = 0;

  const flush = () => {
    if (current.length > 0) {
      subpaths.push({ points: current, closed });
    }
    current = [];
    closed = false;
  };

  while (i < tokens.length) {
    const token = tokens[i];
    if (token === 'M' || token === 'L') {
      const x = Number(tokens[i + 1]);
      const y = Number(tokens[i + 2]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`Commande "${token}" incomplète dans un path.`);
      }
      if (token === 'M') {
        flush();
      }
      current.push({ x, y });
      i += 3;
      continue;
    }
    if (token === 'Z' || token === 'z') {
      closed = true;
      i += 1;
      continue;
    }
    return { unsupportedCommand: token[0].toUpperCase() };
  }
  flush();
  return { subpaths };
}

export function parseWorkspaceSvg(svgText: string): ParsedWorkspace {
  let root: XmlElement;
  try {
    root = parseXml(svgText);
  } catch (error) {
    throw new Error(`SVG illisible : ${error instanceof Error ? error.message : String(error)}`);
  }
  if (root.tagName !== 'svg') {
    throw new Error("Le document fourni n'est pas un SVG.");
  }

  const viewBox = root.attributes['viewBox'];
  let width: number;
  let height: number;
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
      throw new Error('Attribut "viewBox" invalide.');
    }
    width = parts[2];
    height = parts[3];
  } else {
    width = Number(root.attributes['width']);
    height = Number(root.attributes['height']);
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Dimensions de la surface de découpe introuvables ou invalides.');
  }

  const webcutter = findDescendant(root, (el) => el.tagName === 'webcutter');
  const profiles: ParsedProfile[] = [];
  let material: ParsedMaterial | null = null;

  if (webcutter) {
    const profilesEl = findChild(webcutter, 'profiles');
    for (const profileEl of profilesEl?.children ?? []) {
      if (profileEl.tagName !== 'profile') continue;
      const lineSpacingAttr = profileEl.attributes['lineSpacingMm'];
      const lineSpacingMm = lineSpacingAttr != null && lineSpacingAttr !== '' ? Number(lineSpacingAttr) : null;
      profiles.push({
        id: requireStringAttr(profileEl, 'id'),
        materialId: requireStringAttr(profileEl, 'materialId'),
        name: profileEl.attributes['name'] ?? '',
        mode: profileEl.attributes['type'] === 'FILL' ? 'FILL' : 'LINE',
        powerPercent: parseNumberAttr(profileEl, 'powerPercent'),
        speedMmPerMin: parseNumberAttr(profileEl, 'speedMmPerMin'),
        passes: parseNumberAttr(profileEl, 'passes'),
        lineSpacingMm: lineSpacingMm != null && Number.isFinite(lineSpacingMm) ? lineSpacingMm : null,
      });
    }

    const materialEl = findChild(webcutter, 'material');
    if (materialEl) {
      material = {
        id: requireStringAttr(materialEl, 'id'),
        name: materialEl.attributes['name'] ?? '',
      };
    }
  }

  const contentGroup = findDescendant(root, (el) => el.tagName === 'g' && el.attributes['id'] === 'content');
  if (!contentGroup) {
    throw new Error('Groupe <g id="content"> introuvable.');
  }

  const paths: ParsedPath[] = contentGroup.children
    .filter((el) => el.tagName === 'path')
    .map((pathEl, index) => {
      const id = pathEl.attributes['id'] || `#${index}`;
      const rawProfileAttr = pathEl.attributes['profile'] ?? null;
      const profileId = rawProfileAttr != null && rawProfileAttr !== '' ? rawProfileAttr : null;

      const d = pathEl.attributes['d'];
      if (!d) {
        throw new Error(`Le path "${id}" n'a pas d'attribut "d".`);
      }

      const parsed = parsePathData(d);
      if ('unsupportedCommand' in parsed) {
        return { id, rawProfileAttr, profileId, subpaths: null, unsupportedCommand: parsed.unsupportedCommand };
      }

      const transformPoint = parseTransform(pathEl.attributes['transform']);
      const subpaths = parsed.subpaths.map((subpath) => ({
        points: subpath.points.map(transformPoint),
        closed: subpath.closed,
      }));
      return { id, rawProfileAttr, profileId, subpaths, unsupportedCommand: null };
    });

  return { width, height, profiles, material, paths };
}
