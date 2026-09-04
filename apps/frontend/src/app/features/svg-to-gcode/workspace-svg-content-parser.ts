import { TreeNode } from '@openng/optimus-ui/api';
import { Material, Profile, ProfileMode, WEBCUTTER_NS } from '@webcutter/shared';
import { FlattenedShape, FlattenedSubpath, groupSubpathsIntoEntities, SvgTreeNodeData } from './svg-flattener.service';

/** Just enough of a `<material>` element from a workspace SVG's `<metadata>` (see
 * docs/workspace-svg-format.md) to offer it as a "(from file)" option in the material dropdown —
 * it has no `profiles` of its own since, being unknown to the DB, every profile referencing it is
 * itself a `missingProfiles()` entry rather than a nested one. */
export type ParsedWorkspaceMaterial = Pick<Material, 'id' | 'name' | 'thicknessMm'>;

export interface ParsedWorkspaceContent {
  width: number;
  height: number;
  shapes: FlattenedShape[];
  tree: TreeNode<SvgTreeNodeData>;
  profiles: Map<string, Profile>;
  material: ParsedWorkspaceMaterial | null;
  /** Resolved `profile` attribute of each `shapes[i]`'s source `<path>`, `null` if it had none —
   * parallel to `shapes`, for the caller to turn into a `groupProfileAssignments` entry. */
  shapeProfileIds: (string | null)[];
}

/** Parses a `d` attribute produced by `pathDataForSubpaths()` (see svg-to-gcode.page.ts): a
 * sequence of `M x y`, `L x y` and `Z` tokens, always whitespace-separated — the same format
 * docs/workspace-svg-format.md documents and the backend's `workspace-svg-parser.ts` parses
 * server-side. Returns `null` for anything else (curves/arcs never appear in a workspace SVG's
 * own content, since the frontend's own flattener already turns every curve into line segments
 * before one is ever produced). */
function parseFlatPathData(d: string): FlattenedSubpath[] | null {
  const tokens = d.trim().split(/\s+/).filter(Boolean);
  const subpaths: FlattenedSubpath[] = [];
  let current: { x: number; y: number }[] = [];
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
        return null;
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
    return null;
  }
  flush();
  return subpaths.length > 0 ? subpaths : null;
}

/** Parses a `transform="matrix(a b c d e f)"` attribute — the only transform function a workspace
 * SVG's own content path ever uses (see docs/workspace-svg-format.md) — into a point-transforming
 * function; identity if `transform` is absent or unparsable. */
function parseMatrixTransform(transform: string | null): (point: { x: number; y: number }) => { x: number; y: number } {
  if (!transform) {
    return (point) => point;
  }
  const match = /matrix\(\s*([^)]+)\)/.exec(transform);
  if (!match) {
    return (point) => point;
  }
  const parts = match[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 6 || parts.some((value) => !Number.isFinite(value))) {
    return (point) => point;
  }
  const [a, b, c, d, e, f] = parts;
  return (point) => ({ x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f });
}

/** Detects whether `source` is a workspace SVG (see docs/workspace-svg-format.md, produced by
 * `buildWorkspaceSvg()`) — `null` if it has no `<metadata><webcutter>` block at all. */
export function isWorkspaceSvg(source: string): boolean {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.documentElement.querySelector('parsererror')) {
    return false;
  }
  return doc.getElementsByTagNameNS(WEBCUTTER_NS, 'webcutter').length > 0;
}

/** Parses a workspace SVG's `<g id="content">` paths directly into shapes + a matching layer
 * tree (one group per content path, since that group's content SVG never nests them further) —
 * unlike a third-party SVG, there's no need to hand this to `SvgFlattenerService`: every content
 * path is already flat `M`/`L`/`Z` geometry with a single `matrix(...)` transform, so this just
 * reads and bakes that transform into each point directly, mirroring the backend's own
 * `parsePathData`/`parseTransform` (`workspace-svg-parser.ts`). Also parses `<profiles>`/
 * `<material>` from the same `<metadata>` block, but leaves it to the caller to decide whether to
 * actually apply them (see `SvgToGcodePage.onWorkspaceImportChoice` — "Import" discards them,
 * "Replace" applies them). Returns `null` if `source` isn't a workspace SVG at all. */
export function parseWorkspaceContent(
  source: string,
  documentId: string,
  fallbackLabel: string,
): ParsedWorkspaceContent | null {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.documentElement.querySelector('parsererror')) {
    return null;
  }
  const webcutter = doc.getElementsByTagNameNS(WEBCUTTER_NS, 'webcutter')[0];
  if (!webcutter) {
    return null;
  }
  const svgRoot = doc.documentElement;

  let width = 100;
  let height = 100;
  const viewBox = svgRoot.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
      width = parts[2];
      height = parts[3];
    }
  }

  const profiles = new Map<string, Profile>();
  const profilesEl = Array.from(webcutter.children).find((el) => el.localName === 'profiles');
  for (const profileEl of Array.from(profilesEl?.children ?? [])) {
    if (profileEl.localName !== 'profile') {
      continue;
    }
    const id = profileEl.getAttribute('id');
    const materialId = profileEl.getAttribute('materialId');
    const name = profileEl.getAttribute('name');
    const color = profileEl.getAttribute('color');
    const mode = profileEl.getAttribute('type');
    const powerPercent = Number(profileEl.getAttribute('powerPercent'));
    const speedMmPerMin = Number(profileEl.getAttribute('speedMmPerMin'));
    const passes = Number(profileEl.getAttribute('passes'));
    const lineSpacingAttr = profileEl.getAttribute('lineSpacingMm');
    if (
      !id ||
      !materialId ||
      !name ||
      !color ||
      (mode !== ProfileMode.LINE && mode !== ProfileMode.FILL) ||
      !Number.isFinite(powerPercent) ||
      !Number.isFinite(speedMmPerMin) ||
      !Number.isFinite(passes)
    ) {
      continue;
    }
    profiles.set(id, {
      id,
      materialId,
      name,
      color,
      mode: mode as ProfileMode,
      powerPercent,
      speedMmPerMin,
      passes,
      lineSpacingMm: lineSpacingAttr != null ? Number(lineSpacingAttr) : null,
    });
  }

  const materialEl = Array.from(webcutter.children).find((el) => el.localName === 'material');
  const materialId = materialEl?.getAttribute('id');
  const materialName = materialEl?.getAttribute('name');
  const thicknessAttr = materialEl?.getAttribute('thicknessMm');
  const thicknessMm = thicknessAttr != null ? Number(thicknessAttr) : NaN;
  const material =
    materialId && materialName && Number.isFinite(thicknessMm)
      ? { id: materialId, name: materialName, thicknessMm }
      : null;

  const shapes: FlattenedShape[] = [];
  const children: TreeNode<SvgTreeNodeData>[] = [];
  const shapeProfileIds: (string | null)[] = [];
  const contentGroup = svgRoot.querySelector('g#content');
  let index = 0;
  for (const pathEl of Array.from(contentGroup?.children ?? [])) {
    if (pathEl.tagName.toLowerCase() !== 'path') {
      continue;
    }
    const d = pathEl.getAttribute('d');
    const parsedSubpaths = d ? parseFlatPathData(d) : null;
    if (!parsedSubpaths) {
      continue;
    }
    const transformPoint = parseMatrixTransform(pathEl.getAttribute('transform'));
    const subpaths = parsedSubpaths.map((subpath) => ({
      points: subpath.points.map(transformPoint),
      closed: subpath.closed,
    }));

    const groupKey = `${documentId}:content:${index}`;
    const label = pathEl.getAttribute('id') || `Path ${index + 1}`;
    shapes.push({
      id: `${documentId}:shape:${index}`,
      subpaths,
      groupKey,
      explodable: groupSubpathsIntoEntities(subpaths).length > 1,
    });
    children.push({ key: groupKey, label, data: { documentId, kind: 'group' }, children: [] });
    shapeProfileIds.push(pathEl.getAttribute('profile') || null);
    index++;
  }

  const tree: TreeNode<SvgTreeNodeData> = {
    key: documentId,
    label: fallbackLabel,
    data: { documentId, kind: 'document' },
    children,
  };

  return { width, height, shapes, tree, profiles, material, shapeProfileIds };
}
