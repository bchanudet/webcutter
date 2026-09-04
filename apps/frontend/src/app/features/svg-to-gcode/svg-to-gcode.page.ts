import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MenuItem, PrimeTemplate, TreeNode } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { ContextMenu } from '@openng/optimus-ui/contextmenu';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { DividerModule } from "@openng/optimus-ui/divider";
import { Message } from '@openng/optimus-ui/message';
import { OverlayBadge } from '@openng/optimus-ui/overlaybadge';
import { Select } from '@openng/optimus-ui/select';
import { Splitter } from '@openng/optimus-ui/splitter';
import { Toolbar } from '@openng/optimus-ui/toolbar';
import { Tree } from '@openng/optimus-ui/tree';
import type { TreeNodeContextMenuSelectEvent } from '@openng/optimus-ui/types/tree';
import { GcodeOrigin, Machine, Material, Profile, ProfileMode, SVG_NS, WEBCUTTER_NS } from '@webcutter/shared';
import Offset from 'polygon-offset';
import { TablerIcon } from '../../shared/tabler-icon/tabler-icon';
import { MachineApiService } from '../configuration/machine/machine-api.service';
import { MaterialsApiService } from '../configuration/materials/materials-api.service';
import { AddTextDialog, TextInsertedEvent } from './add-text-dialog';
import { FilenamePopover } from './filename-popover';
import {
  FlattenedShape,
  FlattenedSubpath,
  SvgFlattenerService,
  SvgTreeNodeData,
  groupSubpathsIntoEntities,
} from './svg-flattener.service';
import { TestPatternDialog, TestPatternParams } from './test-pattern-dialog';
import { TestPatternGeneratorService } from './test-pattern-generator.service';
import { WorkspaceApiService, WorkspaceCheckError } from './workspace-api.service';
import { isWorkspaceSvg, ParsedWorkspaceMaterial, parseWorkspaceContent } from './workspace-svg-content-parser';
import { WorkspaceImportChoice, WorkspaceImportDialog } from './workspace-import-dialog';

/** A 2D affine transform, stored as the standard SVG `matrix(a b c d e f)` components. */
interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY_MATRIX: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Composes `m1 * m2`, i.e. `m2` is applied first, then `m1`. */
function multiplyMatrices(m1: AffineMatrix, m2: AffineMatrix): AffineMatrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

function translateMatrix(tx: number, ty: number): AffineMatrix {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

function rotateMatrix(angleDeg: number, cx: number, cy: number): AffineMatrix {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotation: AffineMatrix = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  return multiplyMatrices(multiplyMatrices(translateMatrix(cx, cy), rotation), translateMatrix(-cx, -cy));
}

function applyMatrix(m: AffineMatrix, point: { x: number; y: number }): { x: number; y: number } {
  return { x: m.a * point.x + m.c * point.y + m.e, y: m.b * point.x + m.d * point.y + m.f };
}

function matrixToAttr(m: AffineMatrix): string {
  return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
}

/** Everything about one imported file — the source SVG itself is deliberately *not* kept: once a
 * file has been flattened (or, for a workspace SVG, parsed directly — see
 * `workspace-svg-content-parser.ts`) into `shapes`/`treeNode`, that derived data *is* the
 * workspace from then on, persisted/restored/undone as-is, never re-derived from raw markup
 * again. */
interface WorkspaceDocument {
  id: string;
  fileName: string;
  width: number;
  height: number;
  shapes: FlattenedShape[];
  skippedTags: string[];
  treeNode: TreeNode<SvgTreeNodeData>;
}

const WORKSPACE_STORAGE_KEY = 'webcutter.svg-to-gcode.workspace';
const MAX_HISTORY_ENTRIES = 20;
/** Rotation snap increment while dragging the rotate handle with Shift held (see
 * `onShapePointerMove`). */
const ROTATE_SNAP_DEG = 15;

/** Stroke color for a shape with no assigned profile, in the exported SVG — the viewer instead
 * uses `var(--p-primary-color, #FF7300)`, which a standalone file can't resolve. */
const DEFAULT_SHAPE_COLOR = '#FF7300';

/** A profile's color + cutting mode, as assigned to a group — the mode decides whether the
 * shape is rendered as a filled area (FILL) or an outlined path (LINE). `profileId` is kept
 * alongside the copied color/mode so an exported SVG can reference the exact profile a shape
 * was cut with, even after the profile's own color/mode changes later. */
interface GroupProfileAssignment {
  profileId: string;
  color: string;
  mode: ProfileMode;
}

/** The part of the workspace that move/rotate/profile-assignment can undo — everything else
 * (selection, loaded documents, material, camera...) is left alone by undo/redo. */
interface WorkspaceSnapshot {
  groupTransforms: Map<string, AffineMatrix>;
  groupProfileAssignments: Map<string, GroupProfileAssignment>;
  shapeOffsets: Map<string, FlattenedSubpath[]>;
}

/** What actually gets persisted to sessionStorage — the documents' own *derived* shapes/tree,
 * not raw SVG source (see `WorkspaceDocument`), so restoring never re-parses/re-flattens
 * anything. */
interface PersistedWorkspaceState {
  nextDocumentId?: number;
  documents?: WorkspaceDocument[];
  selectedGroupKeys?: string[];
  selectedMaterialId?: string | null;
  groupProfileAssignments?: [string, GroupProfileAssignment][];
  groupTransforms?: [string, AffineMatrix][];
  shapeOffsets?: [string, FlattenedSubpath[]][];
  importedMaterials?: [string, ParsedWorkspaceMaterial][];
  importedProfiles?: [string, Profile][];
}

@Component({
  selector: 'app-svg-to-gcode-page',
  imports: [
    FormsModule,
    PrimeTemplate,
    AddTextDialog,
    Button,
    Card,
    ContextMenu,
    InputNumber,
    DividerModule,
    FilenamePopover,
    Message,
    OverlayBadge,
    Select,
    Splitter,
    TestPatternDialog,
    Toolbar,
    Tree,
    TablerIcon,
    WorkspaceImportDialog,
  ],
  templateUrl: './svg-to-gcode.page.html',
  styleUrl: './svg-to-gcode.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgToGcodePage {
  private readonly flattener = inject(SvgFlattenerService);
  private readonly materialsApi = inject(MaterialsApiService);
  private readonly machineApi = inject(MachineApiService);
  private readonly workspaceApi = inject(WorkspaceApiService);
  private readonly testPatternGenerator = inject(TestPatternGeneratorService);
  private readonly router = inject(Router);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly svgCanvas = viewChild.required<ElementRef<SVGSVGElement>>('svgCanvas');
  private readonly testPatternDialog = viewChild.required(TestPatternDialog);
  private readonly addTextDialog = viewChild.required(AddTextDialog);
  private readonly filenamePopover = viewChild.required(FilenamePopover);
  /** Which toolbar download is waiting on `filenamePopover`'s confirmed name — `null` means
   * nothing is pending (e.g. the popover was dismissed without confirming). */
  private pendingDownload: 'svg' | 'gcode' | null = null;
  private readonly workspaceImportDialog = viewChild.required(WorkspaceImportDialog);
  /** The file `workspaceImportDialog` is currently asking Replace-or-Import about — `null` means
   * nothing is pending (e.g. the dialog was dismissed without choosing). */
  private pendingWorkspaceImport: { source: string; fileName: string } | null = null;
  private nextDocumentId = 0;
  private nextExplodeId = 0;
  private dragState: {
    pointerId: number;
    mode: 'move' | 'rotate';
    groupKeys: string[];
    startMatrices: Map<string, AffineMatrix>;
    startFrameTransform: AffineMatrix;
    startPoint: { x: number; y: number };
    bbox: { minX: number; minY: number; maxX: number; maxY: number } | null;
    pivot: { x: number; y: number } | null;
    startAngleDeg: number;
  } | null = null;
  /** A drag that actually moved the selection also fires a trailing `click`; swallow that one
   * so it doesn't collapse a multi-group selection back down to the shape under the pointer. */
  private dragMoved = false;
  private ignoreNextClick = false;

  private undoStack: WorkspaceSnapshot[] = [];
  private redoStack: WorkspaceSnapshot[] = [];
  /** Snapshot taken when a move/rotate drag starts, committed to `undoStack` on pointer-up only
   * if the drag actually changed anything. */
  private pendingDragSnapshot: WorkspaceSnapshot | null = null;
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);

  private panState: {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startView: { x: number; y: number; width: number; height: number };
    mmPerPixelX: number;
    mmPerPixelY: number;
  } | null = null;

  protected readonly machine = signal<Machine | null>(null);
  // Fallback cutting surface until the machine configuration has loaded.
  protected readonly surfaceWidthMm = computed(() => this.machine()?.bedWidthMm ?? 100);
  protected readonly surfaceHeightMm = computed(() => this.machine()?.bedHeightMm ?? 100);
  /** The machine's own max feed rate — the smaller of its X/Y max speeds, same convention as
   * `framing.service.ts` on the backend — used to seed the test pattern dialog's speed defaults. */
  protected readonly maxFeedMmPerMin = computed(() =>
    Math.min(this.machine()?.maxSpeedXMmPerMin ?? 6000, this.machine()?.maxSpeedYMmPerMin ?? 6000),
  );

  /** Visible mm-space window into the canvas — the pan/zoom "camera", independent of the bed's
   * own dimensions above. */
  protected readonly viewBox = signal<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });

  protected readonly documents = signal<WorkspaceDocument[]>([]);
  protected readonly selectedNodes = signal<TreeNode<SvgTreeNodeData>[]>([]);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly checking = signal(false);
  protected readonly downloadingGcode = signal(false);
  protected readonly sendingToOperation = signal(false);
  protected readonly checkErrors = signal<WorkspaceCheckError[] | null>(null);
  protected readonly checkFailureMessage = signal<string | null>(null);
  protected readonly hasCheckErrors = computed(() => (this.checkErrors()?.length ?? 0) > 0);

  protected readonly generatingTestPattern = signal(false);
  protected readonly testPatternErrorMessage = signal<string | null>(null);

  protected readonly materials = signal<Material[]>([]);
  protected readonly selectedMaterialId = signal<string | null>(null);
  /** Materials referenced by an imported workspace SVG's `<metadata>` (see
   * docs/workspace-svg-format.md) that aren't among `materials()` (the app's own DB) — kept so
   * they can still be picked from the material dropdown and so their profiles stay usable/
   * exportable, even though the DB doesn't know them. Accumulates across every workspace SVG
   * imported this session, keyed by id. */
  protected readonly importedMaterials = signal<Map<string, ParsedWorkspaceMaterial>>(new Map());
  /** Same idea as `importedMaterials`, for individual profiles referenced by an imported
   * workspace SVG — a profile can be "missing" even when its material isn't (e.g. it was deleted
   * from the DB material after the file was exported). */
  protected readonly importedProfiles = signal<Map<string, Profile>>(new Map());
  /** Profile (color + mode) assigned to tree node keys (documents/groups) by clicking a profile. */
  protected readonly groupProfileAssignments = signal<Map<string, GroupProfileAssignment>>(new Map());
  /** Move/rotate transform, in mm, keyed by tree node key — applied on top of a shape's own points. */
  protected readonly groupTransforms = signal<Map<string, AffineMatrix>>(new Map());
  /** Kerf-compensated subpaths per shape id, from the last "Apply" in the Laser Offset section. */
  protected readonly shapeOffsets = signal<Map<string, FlattenedSubpath[]>>(new Map());
  /** Live value of the Laser Offset input field (mm), not itself undoable — only "Apply" is. */
  protected readonly laserOffsetMm = signal(0);

  protected readonly treeNodes = computed(() => this.documents().map((doc) => doc.treeNode));
  protected readonly skippedTags = computed(() =>
    Array.from(new Set(this.documents().flatMap((doc) => doc.skippedTags))),
  );
  /** Selected tree node keys (documents and groups). Multiple-selection mode doesn't propagate
   * to ancestors/descendants on its own — the "Select" context-menu command does that manually
   * via `selectNodeAndDescendants()`. */
  protected readonly selectedGroupKeys = computed(
    () => new Set(this.selectedNodes().map((node) => node.key as string)),
  );
  private readonly nodeByKey = computed(() => {
    const map = new Map<string, TreeNode<SvgTreeNodeData>>();
    const walk = (nodes: TreeNode<SvgTreeNodeData>[]) => {
      for (const node of nodes) {
        if (node.key) {
          map.set(node.key, node);
        }
        if (node.children) {
          walk(node.children);
        }
      }
    };
    walk(this.treeNodes());
    return map;
  });

  /** Node the user right-clicked, captured by the tree's context-menu event so the "select"/
   * "delete" commands below know which node (and its descendants) to act on. */
  private contextMenuNode: TreeNode<SvgTreeNodeData> | null = null;
  protected readonly treeContextMenuItems: MenuItem[] = [
    {
      label: 'Select',
      command: () => {
        if (this.contextMenuNode) {
          this.selectNodeAndDescendants(this.contextMenuNode);
        }
      },
    },
    {
      label: 'Delete',
      command: () => {
        if (this.contextMenuNode) {
          this.deleteNodeAndDescendants(this.contextMenuNode);
        }
      },
    },
    {
      label: 'Explode',
      command: () => {
        if (this.contextMenuNode) {
          this.explodeNode(this.contextMenuNode);
        }
      },
    },
  ];

  protected onTreeContextMenuSelect(event: TreeNodeContextMenuSelectEvent): void {
    this.contextMenuNode = event.node as TreeNode<SvgTreeNodeData>;
  }

  /** Every node in the subtree rooted at `node`, `node` itself included. */
  private collectNodesRecursively(node: TreeNode<SvgTreeNodeData>): TreeNode<SvgTreeNodeData>[] {
    const nodes = [node];
    for (const child of node.children ?? []) {
      nodes.push(...this.collectNodesRecursively(child));
    }
    return nodes as TreeNode<SvgTreeNodeData>[];
  }

  /** Selects `node` and every one of its descendants in the SVG visualizer. */
  protected selectNodeAndDescendants(node: TreeNode<SvgTreeNodeData>): void {
    this.selectedNodes.set(this.collectNodesRecursively(node));
  }

  /** Removes `node` and every one of its descendants from the workspace: the whole document if
   * `node` is a document root, or just the matching shapes/tree-nodes if it's a group. */
  protected deleteNodeAndDescendants(node: TreeNode<SvgTreeNodeData>): void {
    const keys = new Set(
      this.collectNodesRecursively(node).map((n) => n.key as string).filter(Boolean),
    );

    if (node.data?.kind === 'document') {
      this.documents.update((docs) => docs.filter((doc) => doc.id !== node.data?.documentId));
    } else {
      this.documents.update((docs) =>
        docs.map((doc) => ({
          ...doc,
          shapes: doc.shapes.filter((shape) => !keys.has(shape.groupKey)),
          treeNode: this.removeNodeFromTree(doc.treeNode, node.key as string),
        })),
      );
    }

    this.selectedNodes.update((nodes) => nodes.filter((n) => !keys.has(n.key as string)));
    this.groupProfileAssignments.update((assignments) => {
      const next = new Map(assignments);
      for (const key of keys) {
        next.delete(key);
      }
      return next;
    });
    this.groupTransforms.update((transforms) => {
      const next = new Map(transforms);
      for (const key of keys) {
        next.delete(key);
      }
      return next;
    });
    this.persistState();
  }

  /** Returns a copy of the tree with the node matching `targetKey` removed, wherever it is. */
  private removeNodeFromTree(
    node: TreeNode<SvgTreeNodeData>,
    targetKey: string,
  ): TreeNode<SvgTreeNodeData> {
    if (!node.children) {
      return node;
    }
    return {
      ...node,
      children: node.children
        .filter((child) => child.key !== targetKey)
        .map((child) => this.removeNodeFromTree(child, targetKey)),
    };
  }

  /** Returns a copy of the tree with `newChildren` appended under the node matching `targetKey`. */
  private addChildrenToNode(
    node: TreeNode<SvgTreeNodeData>,
    targetKey: string,
    newChildren: TreeNode<SvgTreeNodeData>[],
  ): TreeNode<SvgTreeNodeData> {
    if (node.key === targetKey) {
      return { ...node, children: [...(node.children ?? []), ...newChildren] };
    }
    if (!node.children) {
      return node;
    }
    return {
      ...node,
      children: node.children.map((child) => this.addChildrenToNode(child, targetKey, newChildren)),
    };
  }

  /** Splits every shape tagged with `node`'s key into its independent entities (see
   * `groupSubpathsIntoEntities`), each becoming its own shape with a fresh tree line under
   * `node` — a no-op for shapes that aren't actually explodable. */
  protected explodeNode(node: TreeNode<SvgTreeNodeData>): void {
    const targetKey = node.key as string;
    if (this.applyExplode(targetKey)) {
      this.persistState();
    }
  }

  /** Core explode mutation — pulled out of `explodeNode()` mainly so its "did anything actually
   * explode" return value stays separate from persisting. Its result is just more
   * `documents()` shape/tree state like any other, saved and restored as-is (see
   * `persistState()`/`restoreState()`) — no separate bookkeeping needed. */
  private applyExplode(targetKey: string): boolean {
    let exploded = false;

    this.documents.update((docs) =>
      docs.map((doc) => {
        const matching = doc.shapes.filter((shape) => shape.groupKey === targetKey);
        if (matching.length === 0) {
          return doc;
        }

        const newShapes: FlattenedShape[] = [];
        const newChildren: TreeNode<SvgTreeNodeData>[] = [];
        let docExploded = false;

        for (const shape of matching) {
          const entities = groupSubpathsIntoEntities(shape.subpaths);
          if (entities.length <= 1) {
            newShapes.push(shape);
            continue;
          }
          docExploded = true;
          entities.forEach((entitySubpaths, index) => {
            const suffix = this.nextExplodeId++;
            const groupKey = `${targetKey}:explode:${suffix}`;
            newShapes.push({
              id: `${groupKey}:shape`,
              subpaths: entitySubpaths,
              groupKey,
              explodable: false,
            });
            newChildren.push({
              key: groupKey,
              label: `Path ${index + 1}`,
              data: { documentId: doc.id, kind: 'group' },
              children: [],
            });
          });
        }

        if (!docExploded) {
          return doc;
        }
        exploded = true;

        const remaining = doc.shapes.filter((shape) => shape.groupKey !== targetKey);
        return {
          ...doc,
          shapes: [...remaining, ...newShapes],
          treeNode: this.addChildrenToNode(doc.treeNode, targetKey, newChildren),
        };
      }),
    );

    return exploded;
  }

  private readonly handleSizeMm = computed(() =>
    Math.min(Math.max(Math.min(this.surfaceWidthMm(), this.surfaceHeightMm()) * 0.03, 2), 6),
  );

  /** The selection frame's own rectangle (4 world corners + center) as it stood the moment the
   * current selection was made — for a single group this is its exact (possibly already
   * rotated) local bounding box, so re-selecting a tilted shape still shows a tight, oriented
   * frame; for several groups it's the axis-aligned box spanning all of them at that moment. */
  private readonly selectionBaseFrame = signal<{
    corners: { x: number; y: number }[];
    center: { x: number; y: number };
  } | null>(null);
  /** Cumulative move/rotate applied to the selection frame since `selectionBaseFrame` was set —
   * kept in lockstep with each selected group's own matrix while a drag is in progress. */
  private readonly selectionFrameTransform = signal<AffineMatrix>(IDENTITY_MATRIX);

  /** Guide line shown while Shift-dragging a move (see `onShapePointerMove`) — parallel to
   * whichever axis the movement is locked to, through the selection's current (live) center,
   * colored like that axis's own arrow (`.axis--x`/`.axis--y`). `null` outside of that. */
  protected readonly axisLockGuide = signal<{ axis: 'x' | 'y'; x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );

  /** Marching-ants selection frame + rotate handle, shown for the current selection (one or
   * several groups) — moves/rotates together with the shapes it surrounds. */
  protected readonly selectionFrame = computed(() => {
    const keys = this.selectedGroupKeys();
    const base = this.selectionBaseFrame();
    if (keys.size === 0 || !base) {
      return null;
    }

    const transform = this.selectionFrameTransform();
    const corners = base.corners.map((corner) => applyMatrix(transform, corner));
    const center = applyMatrix(transform, base.center);
    const angleDeg = (Math.atan2(transform.b, transform.a) * 180) / Math.PI;

    return {
      groupKeys: [...keys],
      corners,
      points: corners.map((p) => `${p.x},${p.y}`).join(' '),
      handle: corners[1],
      center,
      angleDeg,
      handleSize: this.handleSizeMm(),
    };
  });

  /** Position of the selected origin corner (or center) on the canvas, in mm — purely cosmetic
   * (the axis arrows and grid ruler legend anchor to it), unaffected by `offsetXMm`/`offsetYMm`:
   * the arrows and legend describe the fixed grid itself, not where a command actually lands, so
   * they stay put along the grid's own edge — see `homePoint()` for the offset-aware marker. */
  protected readonly originPoint = computed(() => {
    const width = this.surfaceWidthMm();
    const height = this.surfaceHeightMm();
    switch (this.machine()?.origin) {
      case GcodeOrigin.TOP_LEFT:
        return { x: 0, y: 0 };
      case GcodeOrigin.TOP_RIGHT:
        return { x: width, y: 0 };
      case GcodeOrigin.BOTTOM_RIGHT:
        return { x: width, y: height };
      case GcodeOrigin.CENTER:
        return { x: width / 2, y: height / 2 };
      case GcodeOrigin.BOTTOM_LEFT:
      default:
        return { x: 0, y: height };
    }
  });

  /** Where the laser head actually ends up when `G0 X0 Y0` is sent (the blue dot) — distinct from
   * `originPoint()`: the machine's own origin offset (`Machine.offsetXMm`/`offsetYMm`) means
   * G-code's `(0, 0)` doesn't sit at the grid's corner once an offset is configured (e.g. an
   * offset of (-20, -20) with a 110mm bed means the corner is really G-code (-20, -20), and
   * `(0, 0)` — this dot — sits 20mm in from each edge). Derived by inverting
   * `WorkspaceGcodeGeneratorService.toMachinePoint()`'s own formula for a target of (0, 0); like
   * that backend formula, this doesn't account for `origin`/mirror (neither does the generator
   * yet), only the offset. */
  protected readonly homePoint = computed(() => {
    const machine = this.machine();
    const height = this.surfaceHeightMm();
    return { x: -(machine?.offsetXMm ?? 0), y: height + (machine?.offsetYMm ?? 0) };
  });

  private readonly axisArrowLengthMm = computed(
    () => Math.max(Math.min(this.surfaceWidthMm(), this.surfaceHeightMm()) * 0.15, 5),
  );

  protected readonly xAxisEnd = computed(() => {
    const origin = this.originPoint();
    const direction = this.machine()?.mirrorX ? -1 : 1;
    return { x: origin.x + direction * this.axisArrowLengthMm(), y: origin.y };
  });

  protected readonly yAxisEnd = computed(() => {
    const origin = this.originPoint();
    const direction = this.machine()?.mirrorY ? 1 : -1;
    return { x: origin.x, y: origin.y + direction * this.axisArrowLengthMm() };
  });

  /** Ruler ticks every 10mm along the bottom/left edges, labeled with distance from the origin. */
  protected readonly gridLegendX = computed(() =>
    this.buildGridLegend(this.surfaceWidthMm(), this.originPoint().x),
  );
  protected readonly gridLegendY = computed(() =>
    this.buildGridLegend(this.surfaceHeightMm(), this.originPoint().y),
  );

  /** The DB material list, plus one entry per `importedMaterials()` not already among them,
   * labeled "(from file)" so the user can tell a temporary stand-in from a real, saved material. */
  protected readonly materialOptions = computed(() => {
    const dbOptions = this.materials().map((material) => ({
      label: `${material.name} (${material.thicknessMm} mm)`,
      value: material.id,
    }));
    const dbIds = new Set(this.materials().map((material) => material.id));
    const fileOptions = Array.from(this.importedMaterials().values())
      .filter((material) => !dbIds.has(material.id))
      .map((material) => ({
        label: `${material.name} (${material.thicknessMm} mm) (from file)`,
        value: material.id,
      }));
    return [...dbOptions, ...fileOptions];
  });
  /** Resolves the selected material from the DB list first, falling back to an imported-from-file
   * one — which has no `profiles` of its own, since every profile attached to it is by definition
   * missing from the DB and so surfaces through `missingProfiles()` instead. */
  protected readonly selectedMaterial = computed(() => {
    const id = this.selectedMaterialId();
    if (id == null) {
      return null;
    }
    const fromDb = this.materials().find((material) => material.id === id);
    if (fromDb) {
      return fromDb;
    }
    const fromFile = this.importedMaterials().get(id);
    return fromFile ? { ...fromFile, profiles: [] } : null;
  });
  protected readonly profiles = computed(() => this.selectedMaterial()?.profiles ?? []);
  /** Profiles an imported workspace SVG attached to the selected material that `materials()` (the
   * DB) doesn't currently have — shown separately, dashed, below the material's real profiles. */
  protected readonly missingProfiles = computed(() => {
    const materialId = this.selectedMaterialId();
    if (materialId == null) {
      return [];
    }
    const knownIds = new Set(
      this.materials().flatMap((material) => material.profiles).map((profile) => profile.id),
    );
    return Array.from(this.importedProfiles().values()).filter(
      (profile) => profile.materialId === materialId && !knownIds.has(profile.id),
    );
  });
  /** Profile id(s) assigned to whichever group(s) are currently selected — lets the sidebar
   * highlight the matching entry in `profiles()`/`missingProfiles()` when a shape is clicked, so
   * the user can immediately see (and re-click to change) which profile it's already using. */
  protected readonly selectedProfileIds = computed(() => {
    const assignments = this.groupProfileAssignments();
    const ids = new Set<string>();
    for (const key of this.selectedGroupKeys()) {
      const assignment = assignments.get(key);
      if (assignment) {
        ids.add(assignment.profileId);
      }
    }
    return ids;
  });

  constructor() {
    this.restoreState();

    this.materialsApi.listMaterials().subscribe((materials) => this.materials.set(materials));
    this.machineApi.getMachine().subscribe((machine) => this.machine.set(machine));

    // Re-anchors the selection frame whenever the set of selected groups actually changes
    // (selecting/deselecting), not while dragging — dragging never touches `selectedNodes`. Also
    // re-anchors when a laser offset is applied, since the frame should hug whichever geometry
    // (original or offset) is now the interactive one.
    effect(() => {
      const keys = this.selectedGroupKeys();
      this.shapeOffsets();
      this.selectionBaseFrame.set(this.computeBaseFrame(keys));
      this.selectionFrameTransform.set(IDENTITY_MATRIX);
      this.persistState();
    });

    // Frames the whole bed once its real dimensions load (only fires again if they later change).
    effect(() => {
      const width = this.surfaceWidthMm();
      const height = this.surfaceHeightMm();
      this.viewBox.set({ x: 0, y: 0, width, height });
    });
  }

  /** Restores the workspace saved by `persistState()`, if any — documents come back exactly as
   * they were (see `WorkspaceDocument`/`PersistedWorkspaceState`), no re-parsing/re-flattening
   * involved. */
  private restoreState(): void {
    let raw: string | null;
    try {
      raw = sessionStorage.getItem(WORKSPACE_STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) {
      return;
    }

    let state: PersistedWorkspaceState;
    try {
      state = JSON.parse(raw);
    } catch {
      return;
    }

    const restoredDocuments = state.documents ?? [];
    this.nextDocumentId = state.nextDocumentId ?? restoredDocuments.length;
    this.documents.set(restoredDocuments);
    this.groupProfileAssignments.set(new Map(state.groupProfileAssignments ?? []));
    this.groupTransforms.set(new Map(state.groupTransforms ?? []));
    this.shapeOffsets.set(new Map(state.shapeOffsets ?? []));
    this.selectedMaterialId.set(state.selectedMaterialId ?? null);
    this.importedMaterials.set(new Map(state.importedMaterials ?? []));
    this.importedProfiles.set(new Map(state.importedProfiles ?? []));

    if (state.selectedGroupKeys?.length) {
      const keys = new Set(state.selectedGroupKeys);
      this.selectedNodes.set(
        [...this.nodeByKey().values()].filter((node) => keys.has(node.key as string)),
      );
    }
  }

  /** Saves everything needed to rebuild the workspace after an abrupt page change — the
   * documents' own derived shapes/tree, not raw SVG source (see `WorkspaceDocument`). */
  private persistState(): void {
    const state: PersistedWorkspaceState = {
      nextDocumentId: this.nextDocumentId,
      documents: this.documents(),
      selectedGroupKeys: [...this.selectedGroupKeys()],
      selectedMaterialId: this.selectedMaterialId(),
      groupProfileAssignments: [...this.groupProfileAssignments().entries()],
      groupTransforms: [...this.groupTransforms().entries()],
      shapeOffsets: [...this.shapeOffsets().entries()],
      importedMaterials: [...this.importedMaterials().entries()],
      importedProfiles: [...this.importedProfiles().entries()],
    };

    try {
      sessionStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Could not save the workspace to sessionStorage.', error);
    }
  }

  private computeBaseFrame(
    keys: Set<string>,
  ): { corners: { x: number; y: number }[]; center: { x: number; y: number } } | null {
    if (keys.size === 0) {
      return null;
    }

    const offset = 0.25;

    if (keys.size === 1) {
      const key = [...keys][0];
      const local = this.computeLocalBBox(key);
      if (!local) {
        return null;
      }
      const matrix = this.groupTransforms().get(key) ?? IDENTITY_MATRIX;
      const corners = [
        { x: local.minX - offset, y: local.minY - offset},
        { x: local.maxX + offset, y: local.minY - offset},
        { x: local.maxX + offset, y: local.maxY + offset},
        { x: local.minX - offset, y: local.maxY + offset},
      ].map((corner) => applyMatrix(matrix, corner));
      const center = applyMatrix(matrix, {
        x: (local.minX + local.maxX) / 2,
        y: (local.minY + local.maxY) / 2,
      });
      return { corners, center };
    }

    const world = this.computeSelectionWorldBBox(keys);
    if (!world) {
      return null;
    }
    return {
      corners: [
        { x: world.minX, y: world.minY },
        { x: world.maxX, y: world.minY },
        { x: world.maxX, y: world.maxY },
        { x: world.minX, y: world.maxY },
      ],
      center: { x: (world.minX + world.maxX) / 2, y: (world.minY + world.maxY) / 2 },
    };
  }

  private buildGridLegend(lengthMm: number, originMm: number): { pos: number; label: number }[] {
    const ticks: { pos: number; label: number }[] = [];
    for (let pos = 0; pos <= lengthMm; pos += 10) {
      ticks.push({ pos, label: Math.round(Math.abs(pos - originMm)) });
    }
    return ticks;
  }

  openFilePicker(): void {
    this.fileInput().nativeElement.click();
  }

  protected openTestPatternDialog(): void {
    this.testPatternDialog().open();
  }

  /** "Generate" in the test pattern dialog: builds a grid-of-shapes workspace SVG (see
   * `TestPatternGeneratorService`) sized to the machine's own cutting surface, then wipes the
   * *entire* current workspace via `reset()` (including the temporary material/profile bookkeeping
   * — a previous pattern's now-irrelevant temporary profiles shouldn't keep piling up across
   * repeated generations) and loads that pattern in its place. */
  protected onGenerateTestPattern(params: TestPatternParams): void {
    const material = this.materials().find((candidate) => candidate.id === params.materialId);
    if (!material) {
      this.testPatternErrorMessage.set('Select a material first.');
      return;
    }

    this.generatingTestPattern.set(true);
    this.testPatternErrorMessage.set(null);
    this.testPatternGenerator
      .generate({
        ...params,
        material,
        surfaceWidthMm: this.surfaceWidthMm(),
        surfaceHeightMm: this.surfaceHeightMm(),
      })
      .subscribe({
        next: (svg) => {
          this.generatingTestPattern.set(false);
          this.reset();
          // The generator's own output is already a workspace SVG (flat M/L/Z + a single matrix
          // transform per path, its own <metadata><webcutter> profiles/material) — parse it
          // directly rather than handing it to the flattener, and keep its profiles/material
          // (`includeMetadata: true`) since this *is* the whole new workspace, not a merge.
          this.addWorkspaceContentDocument(svg, 'Test pattern', true);
          this.testPatternDialog().close();
        },
        error: (error: unknown) => {
          this.generatingTestPattern.set(false);
          this.testPatternErrorMessage.set(
            error instanceof Error ? error.message : 'Could not generate the test pattern.',
          );
        },
      });
  }

  /** Resets the pan/zoom camera back to framing the whole bed. */
  resetView(): void {
    this.viewBox.set({ x: 0, y: 0, width: this.surfaceWidthMm(), height: this.surfaceHeightMm() });
  }

  /** A workspace SVG (has its own `<metadata><webcutter>`, i.e. something this app itself
   * exported earlier) needs `workspaceImportDialog` to ask Replace-or-Import first (see
   * `onWorkspaceImportChoice`) — any other SVG loads immediately, merged into the current
   * workspace exactly like before. */
  async onFileInputChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    this.errorMessage.set(null);

    try {
      const source = await file.text();
      if (isWorkspaceSvg(source)) {
        this.pendingWorkspaceImport = { source, fileName: file.name };
        this.workspaceImportDialog().open(file.name);
      } else {
        this.addDocumentFromSource(source, file.name);
      }
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Could not read this SVG file.',
      );
    }
  }

  /** Fired once the user picks "Replace" or "Import" in `workspaceImportDialog` for the file
   * `onFileInputChange` just staged in `pendingWorkspaceImport`. */
  protected onWorkspaceImportChoice(choice: WorkspaceImportChoice): void {
    const pending = this.pendingWorkspaceImport;
    this.pendingWorkspaceImport = null;
    if (!pending) {
      return;
    }
    if (choice === 'replace') {
      this.reset();
    }
    this.addWorkspaceContentDocument(pending.source, pending.fileName, choice === 'replace');
  }

  /** Adds `source` (raw SVG markup, *not* already a workspace SVG) as a new workspace document by
   * flattening it — shared by the file input (for a third-party SVG) and by "Add text"
   * (`onTextInserted`), which hands it the SVG the backend generated for the typed text. */
  private addDocumentFromSource(source: string, label: string): void {
    const id = `doc-${this.nextDocumentId++}`;
    const result = this.flattener.flatten(id, source, label);

    const workspaceDocument: WorkspaceDocument = {
      id,
      fileName: label,
      width: result.width,
      height: result.height,
      shapes: result.shapes,
      skippedTags: result.skippedTags,
      treeNode: result.tree,
    };

    this.documents.update((docs) => [...docs, workspaceDocument]);

    if (result.shapes.length === 0) {
      this.errorMessage.set(`No cuttable shape (path, rect, circle...) found in "${label}".`);
    }
    this.persistState();
  }

  /** Adds a workspace SVG's own `<g id="content">` paths directly as a new document — no
   * flattener involved, since they're already flat `M`/`L`/`Z` with a single `matrix(...)`
   * transform (see `parseWorkspaceContent`/docs/workspace-svg-format.md). `includeMetadata`
   * controls whether the file's own profiles/material are imported too ("Replace", or the
   * test-pattern generator's own output) or discarded, leaving every path unassigned/orange
   * ("Import" — see `onWorkspaceImportChoice`). */
  private addWorkspaceContentDocument(source: string, fileName: string, includeMetadata: boolean): void {
    const id = `doc-${this.nextDocumentId++}`;
    const parsed = parseWorkspaceContent(source, id, fileName);
    if (!parsed) {
      this.errorMessage.set(`"${fileName}" is not a valid workspace SVG.`);
      return;
    }

    const workspaceDocument: WorkspaceDocument = {
      id,
      fileName,
      width: parsed.width,
      height: parsed.height,
      shapes: parsed.shapes,
      skippedTags: [],
      treeNode: parsed.tree,
    };
    this.documents.update((docs) => [...docs, workspaceDocument]);

    if (includeMetadata) {
      if (parsed.material) {
        const material = parsed.material;
        this.importedMaterials.update((map) => new Map(map).set(material.id, material));
        this.selectedMaterialId.set(material.id);
      }
      if (parsed.profiles.size > 0) {
        this.importedProfiles.update((map) => {
          const next = new Map(map);
          for (const [profileId, profile] of parsed.profiles) {
            next.set(profileId, profile);
          }
          return next;
        });
        this.groupProfileAssignments.update((assignments) => {
          const next = new Map(assignments);
          parsed.shapes.forEach((shape, index) => {
            const profileId = parsed.shapeProfileIds[index];
            const profile = profileId != null ? parsed.profiles.get(profileId) : undefined;
            if (profile) {
              next.set(shape.groupKey, { profileId: profile.id, color: profile.color, mode: profile.mode });
            }
          });
          return next;
        });
      }
    }
    // else "Import": paths merge in with no profile assignment, rendered orange by default —
    // same as any shape with no `groupProfileAssignments` entry.

    if (parsed.shapes.length === 0) {
      this.errorMessage.set(`No cuttable shape found in "${fileName}".`);
    }
    this.persistState();
  }

  protected openAddTextDialog(): void {
    this.addTextDialog().open();
  }

  /** "Insert" in the "Add text" dialog: the backend has already turned the text into an SVG
   * (`FontApiService.textToSvg`) — drop it into the workspace exactly like an uploaded file, so
   * the user can assign it a profile like any other shape. */
  protected onTextInserted(event: TextInsertedEvent): void {
    this.errorMessage.set(null);
    this.addDocumentFromSource(event.svg, `Text: "${event.text}"`);
  }

  /** Builds a single <path d> covering every subpath of the shape (e.g. an outer outline plus
   * an inner hole), so it can be rendered with fill-rule="evenodd" and get real holes. */
  protected shapePathData(shape: FlattenedShape): string {
    return this.pathDataForSubpaths(shape.subpaths);
  }

  private pathDataForSubpaths(subpaths: FlattenedSubpath[]): string {
    return subpaths
      .map((subpath) => {
        const [first, ...rest] = subpath.points;
        if (!first) {
          return '';
        }
        const segments = [`M ${first.x} ${first.y}`, ...rest.map((point) => `L ${point.x} ${point.y}`)];
        if (subpath.closed) {
          segments.push('Z');
        }
        return segments.join(' ');
      })
      .join(' ');
  }

  protected hasOffset(shape: FlattenedShape): boolean {
    return this.shapeOffsets().has(shape.id);
  }

  /** <path d> for the kerf-compensated version of the shape, once "Apply" has produced one. */
  protected offsetPathData(shape: FlattenedShape): string {
    return this.pathDataForSubpaths(this.shapeOffsets().get(shape.id) ?? []);
  }

  /** The subpaths actually shown as interactive content: the kerf-compensated ones once an
   * offset has been applied, otherwise the shape's own — bounding boxes (selection frame, drag
   * clamping) should track whichever of the two is really on screen and clickable. */
  private effectiveSubpaths(shape: FlattenedShape): FlattenedSubpath[] {
    return this.shapeOffsets().get(shape.id) ?? shape.subpaths;
  }

  /** Kerf-compensates every path in the workspace by `laserOffsetMm()`: outer contours grow,
   * holes shrink (or the reverse, for a negative value) — see `computeOffsetForShape`. */
  protected applyLaserOffset(): void {
    const value = this.laserOffsetMm();
    if (value === 0) {
      return;
    }

    this.pushUndoSnapshot(this.takeSnapshot());

    const next = new Map<string, FlattenedSubpath[]>();
    for (const document of this.documents()) {
      for (const shape of document.shapes) {
        next.set(shape.id, this.computeOffsetForShape(shape, value));
      }
    }
    this.shapeOffsets.set(next);
    this.persistState();
  }

  /** Offsets every closed subpath of a shape by `offsetMm`, using the subpath's nesting depth
   * (how many *other* closed subpaths of the same shape contain it) to tell an outer contour
   * from a hole: even depth grows (outward), odd depth shrinks (inward) — exactly reversed for a
   * negative `offsetMm`. Open subpaths (no well-defined inside) pass through unchanged. */
  private computeOffsetForShape(shape: FlattenedShape, offsetMm: number): FlattenedSubpath[] {
    const closedSubpaths = shape.subpaths.filter((subpath) => subpath.closed && subpath.points.length >= 3);
    const result: FlattenedSubpath[] = [];

    for (const subpath of shape.subpaths) {
      if (!subpath.closed || subpath.points.length < 3) {
        result.push(subpath);
        continue;
      }

      const depth = closedSubpaths.filter(
        (other) => other !== subpath && this.isPointInPolygon(subpath.points[0], other.points),
      ).length;
      const effectiveDelta = depth % 2 === 0 ? offsetMm : -offsetMm;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape depends on the untyped library's runtime output
        const rings: any = new Offset().data(subpath.points.map((point) => [point.x, point.y])).offset(effectiveDelta);
        const isSingleRing = typeof rings[0]?.[0] === 'number';
        const normalizedRings: number[][][] = isSingleRing ? [rings] : rings;
        for (const ring of normalizedRings) {
          if (ring.length < 3) {
            continue;
          }
          result.push({ points: ring.map(([x, y]) => ({ x, y })), closed: true });
        }
      } catch {
        // Offsetting can fail on degenerate input (e.g. a delta larger than the shape itself) —
        // keep the original subpath rather than losing it or crashing the whole operation.
        result.push(subpath);
      }
    }

    return result;
  }

  protected isShapeSelected(shape: FlattenedShape): boolean {
    return this.selectedGroupKeys().has(shape.groupKey);
  }

  /** Selects the shape's group in the workspace tree: replaces the selection, or extends it
   * when the user holds Ctrl. */
  protected onShapeClick(event: MouseEvent, shape: FlattenedShape): void {
    if (this.ignoreNextClick) {
      this.ignoreNextClick = false;
      return;
    }

    const node = this.nodeByKey().get(shape.groupKey);
    if (!node) {
      return;
    }

    if (event.ctrlKey) {
      if (!this.selectedNodes().some((selected) => selected.key === node.key)) {
        this.selectedNodes.update((nodes) => [...nodes, node]);
      }
    } else {
      this.selectedNodes.set([node]);
    }
  }

  /** Clears the selection when clicking empty canvas — but not when clicking inside the
   * marching-ants selection frame, even on the small margin around the shape itself. */
  protected onBackgroundClick(event: MouseEvent): void {
    const frame = this.selectionFrame();
    if (frame) {
      const point = this.clientToSvgPoint(event.clientX, event.clientY);
      if (this.isPointInPolygon(point, frame.corners)) {
        return;
      }
    }
    this.selectedNodes.set([]);
  }

  private isPointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      const intersects =
        a.y > point.y !== b.y > point.y &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  /** A shape's group's current move/rotate transform — documents are always imported at a 1:1 mm
   * scale (see docs/workspace-svg-format.md), so there is no separate document-level scale to
   * combine it with. */
  protected shapeTransform(shape: FlattenedShape): string {
    return matrixToAttr(this.groupTransforms().get(shape.groupKey) ?? IDENTITY_MATRIX);
  }

  /** Starts dragging the current selection when the user presses down on one of its shapes. */
  protected onShapePointerDown(event: PointerEvent, shape: FlattenedShape): void {
    if (event.button !== 0 || !this.isShapeSelected(shape)) {
      return;
    }

    const groupKeys = Array.from(this.selectedGroupKeys());
    const bbox = this.computeSelectionWorldBBox(this.selectedGroupKeys());
    if (!bbox) {
      return;
    }

    event.preventDefault();
    this.dragMoved = false;
    this.pendingDragSnapshot = this.takeSnapshot();
    this.dragState = {
      pointerId: event.pointerId,
      mode: 'move',
      groupKeys,
      startMatrices: new Map(this.groupTransforms()),
      startFrameTransform: this.selectionFrameTransform(),
      startPoint: this.clientToSvgPoint(event.clientX, event.clientY),
      bbox,
      pivot: null,
      startAngleDeg: 0,
    };
    (event.target as Element).setPointerCapture(event.pointerId);
  }

  /** Starts rotating the whole current selection around the center of its selection frame. */
  protected onHandlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const frame = this.selectionFrame();
    if (!frame) {
      return;
    }

    const start = this.clientToSvgPoint(event.clientX, event.clientY);
    this.dragMoved = false;
    this.pendingDragSnapshot = this.takeSnapshot();
    this.dragState = {
      pointerId: event.pointerId,
      mode: 'rotate',
      groupKeys: frame.groupKeys,
      startMatrices: new Map(this.groupTransforms()),
      startFrameTransform: this.selectionFrameTransform(),
      startPoint: start,
      bbox: null,
      pivot: frame.center,
      startAngleDeg: (Math.atan2(start.y - frame.center.y, start.x - frame.center.x) * 180) / Math.PI,
    };
    (event.target as Element).setPointerCapture(event.pointerId);
  }

  protected onShapePointerMove(event: PointerEvent): void {
    const drag = this.dragState;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    this.dragMoved = true;
    const current = this.clientToSvgPoint(event.clientX, event.clientY);

    let step: AffineMatrix;
    if (drag.mode === 'rotate' && drag.pivot) {
      const currentAngleDeg = (Math.atan2(current.y - drag.pivot.y, current.x - drag.pivot.x) * 180) / Math.PI;
      let rotationDeg = currentAngleDeg - drag.startAngleDeg;
      // Shift snaps the rotation applied so far (not the pointer's raw angle) to the nearest
      // 15° increment, so the shape turns in clean steps as the user keeps dragging around.
      if (event.shiftKey) {
        rotationDeg = Math.round(rotationDeg / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
      }
      step = rotateMatrix(rotationDeg, drag.pivot.x, drag.pivot.y);
    } else if (drag.bbox) {
      // Not clamped to the bed: an imported SVG can be (and often is) larger than the cutting
      // surface, in which case forcing its bounding box to stay fully inside would make it
      // impossible to move at all — `WorkspaceCheckService` is what actually enforces staying
      // within bounds, at "Check"/generation time.
      let dx = current.x - drag.startPoint.x;
      let dy = current.y - drag.startPoint.y;
      // Shift locks the move to whichever axis the pointer has traveled farther along, and shows
      // a guide line through the selection's (moving) center, parallel to that axis.
      if (event.shiftKey) {
        const lockedToX = Math.abs(dx) > Math.abs(dy);
        if (lockedToX) {
          dy = 0;
        } else {
          dx = 0;
        }
        const centerX = (drag.bbox.minX + drag.bbox.maxX) / 2 + dx;
        const centerY = (drag.bbox.minY + drag.bbox.maxY) / 2 + dy;
        const view = this.viewBox();
        this.axisLockGuide.set(
          lockedToX
            ? { axis: 'x', x1: view.x, y1: centerY, x2: view.x + view.width, y2: centerY }
            : { axis: 'y', x1: centerX, y1: view.y, x2: centerX, y2: view.y + view.height },
        );
      } else {
        this.axisLockGuide.set(null);
      }
      step = translateMatrix(dx, dy);
    } else {
      return;
    }

    const next = new Map(drag.startMatrices);
    for (const key of drag.groupKeys) {
      const base = drag.startMatrices.get(key) ?? IDENTITY_MATRIX;
      next.set(key, multiplyMatrices(step, base));
    }
    this.groupTransforms.set(next);
    this.selectionFrameTransform.set(multiplyMatrices(step, drag.startFrameTransform));
  }

  protected onShapePointerUp(event: PointerEvent): void {
    if (this.dragState?.pointerId === event.pointerId) {
      this.ignoreNextClick = this.dragMoved;
      this.dragState = null;
      this.axisLockGuide.set(null);
      if (this.dragMoved && this.pendingDragSnapshot) {
        this.pushUndoSnapshot(this.pendingDragSnapshot);
        this.persistState();
      }
      this.pendingDragSnapshot = null;
    }
  }

  /** Takes a snapshot of the undo/redo-tracked part of the workspace. */
  private takeSnapshot(): WorkspaceSnapshot {
    return {
      groupTransforms: new Map(this.groupTransforms()),
      groupProfileAssignments: new Map(this.groupProfileAssignments()),
      shapeOffsets: new Map(this.shapeOffsets()),
    };
  }

  private applySnapshot(snapshot: WorkspaceSnapshot): void {
    this.groupTransforms.set(new Map(snapshot.groupTransforms));
    this.groupProfileAssignments.set(new Map(snapshot.groupProfileAssignments));
    this.shapeOffsets.set(new Map(snapshot.shapeOffsets));
  }

  /** Records `snapshot` (the state *before* the change that just happened) onto the undo stack,
   * capped at the last `MAX_HISTORY_ENTRIES` manipulations, and clears the redo stack. */
  private pushUndoSnapshot(snapshot: WorkspaceSnapshot): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > MAX_HISTORY_ENTRIES) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.updateUndoRedoAvailability();
  }

  private updateUndoRedoAvailability(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
  }

  protected undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) {
      return;
    }
    this.redoStack.push(this.takeSnapshot());
    this.applySnapshot(previous);
    this.updateUndoRedoAvailability();
    this.persistState();
  }

  protected redo(): void {
    const next = this.redoStack.pop();
    if (!next) {
      return;
    }
    this.undoStack.push(this.takeSnapshot());
    this.applySnapshot(next);
    this.updateUndoRedoAvailability();
    this.persistState();
  }

  /** Converts a client (screen) point to mm-space, accounting for the current pan/zoom. */
  private clientToSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.svgCanvas().nativeElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 };
    }
    const view = this.viewBox();
    return {
      x: view.x + ((clientX - rect.left) / rect.width) * view.width,
      y: view.y + ((clientY - rect.top) / rect.height) * view.height,
    };
  }

  /** Zooms in/out around the cursor position, keeping the point under it fixed on screen. */
  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const view = this.viewBox();
    const pointer = this.clientToSvgPoint(event.clientX, event.clientY);

    const bedSpan = Math.max(this.surfaceWidthMm(), this.surfaceHeightMm());
    const currentSpan = Math.max(view.width, view.height);
    const rawScale = Math.exp(event.deltaY * 0.001);
    const scale = Math.min(Math.max(rawScale, (bedSpan * 0.02) / currentSpan), (bedSpan * 4) / currentSpan);

    this.viewBox.set(
      this.clampView({
        x: pointer.x - (pointer.x - view.x) * scale,
        y: pointer.y - (pointer.y - view.y) * scale,
        width: view.width * scale,
        height: view.height * scale,
      }),
    );
  }

  /** Starts panning the view when the user presses the middle mouse button on the canvas. */
  protected onCanvasPointerDown(event: PointerEvent): void {
    if (event.button !== 1) {
      return;
    }
    const rect = this.svgCanvas().nativeElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    event.preventDefault();
    const view = this.viewBox();
    this.panState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startView: view,
      mmPerPixelX: view.width / rect.width,
      mmPerPixelY: view.height / rect.height,
    };
    (event.target as Element).setPointerCapture(event.pointerId);
  }

  protected onCanvasPointerMove(event: PointerEvent): void {
    const pan = this.panState;
    if (!pan || pan.pointerId !== event.pointerId) {
      return;
    }

    const dx = (event.clientX - pan.startClientX) * pan.mmPerPixelX;
    const dy = (event.clientY - pan.startClientY) * pan.mmPerPixelY;
    this.viewBox.set(
      this.clampView({ ...pan.startView, x: pan.startView.x - dx, y: pan.startView.y - dy }),
    );
  }

  protected onCanvasPointerUp(event: PointerEvent): void {
    if (this.panState?.pointerId === event.pointerId) {
      this.panState = null;
    }
  }

  /** Keeps the view from drifting arbitrarily far from the bed — allows up to one view's worth
   * of empty margin around it in every direction. */
  private clampView(view: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): { x: number; y: number; width: number; height: number } {
    const minX = -view.width;
    const maxX = this.surfaceWidthMm();
    const minY = -view.height;
    const maxY = this.surfaceHeightMm();
    return {
      ...view,
      x: Math.min(Math.max(view.x, minX), Math.max(minX, maxX)),
      y: Math.min(Math.max(view.y, minY), Math.max(minY, maxY)),
    };
  }

  /** Current world (mm) bounding box of every shape belonging to the given groups, including
   * whatever move/rotate transform is already applied to them. Used to clamp a move drag. */
  private computeSelectionWorldBBox(
    groupKeys: Set<string>,
  ): { minX: number; minY: number; maxX: number; maxY: number } | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;

    for (const document of this.documents()) {
      for (const shape of document.shapes) {
        if (!groupKeys.has(shape.groupKey)) {
          continue;
        }
        const matrix = this.groupTransforms().get(shape.groupKey) ?? IDENTITY_MATRIX;
        for (const subpath of this.effectiveSubpaths(shape)) {
          for (const point of subpath.points) {
            found = true;
            const p = applyMatrix(matrix, point);
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          }
        }
      }
    }

    return found ? { minX, minY, maxX, maxY } : null;
  }

  /** A group's own (untransformed) bounding box, in mm — the reference frame that the
   * selection box and rotate handle are carried on top of via the group's current transform. */
  private computeLocalBBox(
    groupKey: string,
  ): { minX: number; minY: number; maxX: number; maxY: number } | null {
    for (const document of this.documents()) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let found = false;

      for (const shape of document.shapes) {
        if (shape.groupKey !== groupKey) {
          continue;
        }
        for (const subpath of this.effectiveSubpaths(shape)) {
          for (const point of subpath.points) {
            found = true;
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
          }
        }
      }

      if (found) {
        return { minX, minY, maxX, maxY };
      }
    }
    return null;
  }

  /** Outline color: transparent for a FILL-mode profile (so the fill itself carries the color
   * and doesn't get muddied by a visible border), otherwise the profile's color (or default). */
  protected strokeForShape(shape: FlattenedShape): string {
    const assignment = this.groupProfileAssignments().get(shape.groupKey);
    if (assignment?.mode === 'FILL') {
      return 'transparent';
    }
    return assignment?.color ?? 'var(--p-primary-color, #FF7300)';
  }

  /** Fill color: the profile's color for a FILL-mode profile, otherwise none — shapes without a
   * FILL profile stay outline-only, exactly as before. */
  protected fillForShape(shape: FlattenedShape): string {
    const assignment = this.groupProfileAssignments().get(shape.groupKey);
    return assignment?.mode === 'FILL' ? assignment.color : 'none';
  }

  /** Applies a profile's color/mode to the tree nodes currently checked in the workspace tree. */
  protected applyProfile(profile: Profile): void {
    const keys = this.selectedGroupKeys();
    if (keys.size === 0) {
      return;
    }
    this.pushUndoSnapshot(this.takeSnapshot());
    this.groupProfileAssignments.update((assignments) => {
      const next = new Map(assignments);
      for (const key of keys) {
        next.set(key, { profileId: profile.id, color: profile.color, mode: profile.mode });
      }
      return next;
    });
    this.persistState();
  }

  protected onMaterialChange(materialId: string | null): void {
    this.selectedMaterialId.set(materialId);
    this.persistState();
  }

  /** Opens the file-name popover for "Save workspace SVG" — the actual download only happens once
   * the user confirms a name (see `onFilenameConfirmed`), instead of always saving as a literal
   * "workspace.svg" that the browser then silently disambiguates on every repeat download. */
  protected openSaveSvgPopover(event: Event): void {
    if (this.documents().length === 0) {
      return;
    }
    this.pendingDownload = 'svg';
    this.filenamePopover().open(event, 'workspace', '.svg');
  }

  /** Builds the same SVG as `openSaveSvgPopover()`, sends it to the backend's pre-flight check,
   * and shows whatever rule violations come back (empty means the workspace is ready for g-code). */
  protected checkWorkspace(): void {
    if (this.documents().length === 0) {
      return;
    }

    this.checking.set(true);
    this.checkFailureMessage.set(null);
    this.workspaceApi.check(this.buildWorkspaceSvg()).subscribe({
      next: ({ errors }) => {
        this.checkErrors.set(errors);
        this.checking.set(false);
      },
      error: (error: unknown) => {
        this.checkErrors.set(null);
        this.checkFailureMessage.set(
          (error as { error?: { message?: string } })?.error?.message ?? 'La vérification a échoué.',
        );
        this.checking.set(false);
      },
    });
  }

  /** Opens the file-name popover for "Download G-code" — the actual generate-and-download only
   * happens once the user confirms a name (see `onFilenameConfirmed`). */
  protected openDownloadGcodePopover(event: Event): void {
    if (this.documents().length === 0) {
      return;
    }
    this.pendingDownload = 'gcode';
    this.filenamePopover().open(event, 'workspace', '.gcode');
  }

  /** Fired once the user confirms a name in `filenamePopover`, for whichever toolbar download
   * (`openSaveSvgPopover`/`openDownloadGcodePopover`) opened it. */
  protected onFilenameConfirmed(fileName: string): void {
    const pending = this.pendingDownload;
    this.pendingDownload = null;
    if (pending === 'svg') {
      this.downloadTextFile(this.buildWorkspaceSvg(), fileName, 'image/svg+xml');
    } else if (pending === 'gcode') {
      this.generateAndDownloadGcode(fileName);
    }
  }

  /** Generates the workspace SVG, sends it to the backend. A workspace with rule violations
   * downloads nothing — the violations surface as the toolbar button's danger badge and in the
   * "Errors" card below, exactly like `checkWorkspace()`. */
  private generateAndDownloadGcode(fileName: string): void {
    this.downloadingGcode.set(true);
    this.checkFailureMessage.set(null);
    this.workspaceApi.generate(this.buildWorkspaceSvg()).subscribe({
      next: ({ errors, gcode }) => {
        this.checkErrors.set(errors);
        this.downloadingGcode.set(false);
        if (errors.length === 0 && gcode) {
          this.downloadTextFile(gcode, fileName, 'text/plain');
        }
      },
      error: (error: unknown) => {
        this.checkErrors.set(null);
        this.checkFailureMessage.set(
          (error as { error?: { message?: string } })?.error?.message ?? 'La génération du G-code a échoué.',
        );
        this.downloadingGcode.set(false);
      },
    });
  }

  /** Toolbar "Send to Operation" action: the backend generates the g-code and stores it as the
   * current Operation file directly (`POST /api/workspace/send-to-operation`) — the g-code itself
   * never round-trips through the browser as a download-then-reupload would. The existing
   * WebSocket broadcast picks up the change on the Operation page on its own; this only needs to
   * navigate there once storage is confirmed. A workspace with rule violations sends nothing; the
   * violations surface in the "Errors" card, same as the other two actions. */
  protected sendToOperation(): void {
    if (this.documents().length === 0) {
      return;
    }

    this.sendingToOperation.set(true);
    this.checkFailureMessage.set(null);
    this.workspaceApi.sendToOperation(this.buildWorkspaceSvg()).subscribe({
      next: ({ errors, file }) => {
        this.checkErrors.set(errors);
        this.sendingToOperation.set(false);
        if (errors.length === 0 && file) {
          this.router.navigate(['/operation']);
        }
      },
      error: (error: unknown) => {
        this.checkErrors.set(null);
        this.checkFailureMessage.set(
          (error as { error?: { message?: string } })?.error?.message ?? "L'envoi vers Operation a échoué.",
        );
        this.sendingToOperation.set(false);
      },
    });
  }

  /** "Clear project": wipes the workspace *entirely* — including the temporary material/profile
   * bookkeeping (`importedMaterials`/`importedProfiles`, the dashed "(from file)" entries in the
   * material dropdown and Profiles card), not just the documents/selection/undo state a plain
   * "start over" would need. Once nothing references them, they're just orphaned leftovers from
   * whatever file/pattern was previously loaded — keeping them around would let them silently pile
   * up across repeated imports/generations, so a full clear discards them too. */
  reset(): void {
    this.documents.set([]);
    this.selectedNodes.set([]);
    this.errorMessage.set(null);
    this.checkErrors.set(null);
    this.checkFailureMessage.set(null);
    this.groupProfileAssignments.set(new Map());
    this.groupTransforms.set(new Map());
    this.shapeOffsets.set(new Map());
    this.importedMaterials.set(new Map());
    this.importedProfiles.set(new Map());
    this.laserOffsetMm.set(0);
    this.undoStack = [];
    this.redoStack = [];
    this.updateUndoRedoAvailability();
  }

  /** Builds the workspace export SVG: sized to the machine bed, with a <metadata><webcutter>
   * block describing the used profiles + material (see docs/workspace-svg-format.md), followed
   * by an id="content" group with exactly the paths shown in the viewer's own id="content" group
   * (same geometry, transform and colors), each tagged with its assigned profile id if any. */
  private buildWorkspaceSvg(): string {
    const width = this.surfaceWidthMm();
    const height = this.surfaceHeightMm();

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', `${width}mm`);
    svg.setAttribute('height', `${height}mm`);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.appendChild(this.buildWorkspaceMetadata());
    svg.appendChild(this.buildWorkspaceContentGroup());

    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + new XMLSerializer().serializeToString(svg);
  }

  /** <metadata><webcutter>: format version, every profile referenced by the workspace (in full,
   * regardless of which material is currently selected), and the currently selected material. */
  private buildWorkspaceMetadata(): Element {
    const metadata = document.createElementNS(SVG_NS, 'metadata');
    const webcutter = document.createElementNS(WEBCUTTER_NS, 'webcutter');

    const version = document.createElementNS(WEBCUTTER_NS, 'version');
    version.textContent = '1';
    webcutter.appendChild(version);

    const profilesEl = document.createElementNS(WEBCUTTER_NS, 'profiles');
    for (const profile of this.usedProfiles()) {
      const profileEl = document.createElementNS(WEBCUTTER_NS, 'profile');
      profileEl.setAttribute('id', profile.id);
      profileEl.setAttribute('materialId', profile.materialId);
      profileEl.setAttribute('name', profile.name);
      profileEl.setAttribute('color', profile.color);
      profileEl.setAttribute('type', profile.mode);
      profileEl.setAttribute('powerPercent', String(profile.powerPercent));
      profileEl.setAttribute('speedMmPerMin', String(profile.speedMmPerMin));
      profileEl.setAttribute('passes', String(profile.passes));
      if (profile.lineSpacingMm != null) {
        profileEl.setAttribute('lineSpacingMm', String(profile.lineSpacingMm));
      }
      profilesEl.appendChild(profileEl);
    }
    webcutter.appendChild(profilesEl);

    const material = this.selectedMaterial();
    if (material) {
      const materialEl = document.createElementNS(WEBCUTTER_NS, 'material');
      materialEl.setAttribute('id', material.id);
      materialEl.setAttribute('name', material.name);
      materialEl.setAttribute('thicknessMm', String(material.thicknessMm));
      webcutter.appendChild(materialEl);
    }

    metadata.appendChild(webcutter);
    return metadata;
  }

  /** Every profile assigned to at least one group in the workspace, looked up across all
   * materials (not just the currently selected one) since a profile can stay assigned to a
   * group after the user switches the workspace to a different material — falling back to
   * `importedProfiles()` for one the DB doesn't (or doesn't anymore) have, so a "from file"
   * profile still exports with its full power/speed/passes rather than silently disappearing
   * from the generated workspace's `<metadata>`. */
  private usedProfiles(): Profile[] {
    const usedIds = new Set(
      Array.from(this.groupProfileAssignments().values()).map((assignment) => assignment.profileId),
    );
    const byId = new Map<string, Profile>();
    for (const [id, profile] of this.importedProfiles()) {
      byId.set(id, profile);
    }
    for (const profile of this.materials().flatMap((material) => material.profiles)) {
      byId.set(profile.id, profile);
    }
    return Array.from(byId.values()).filter((profile) => usedIds.has(profile.id));
  }

  /** Mirrors the viewer's own id="content" group (see the template): same shapes, same
   * kerf-compensated geometry, same transform and colors — plus a profile="<id>" attribute on
   * shapes whose group has an assigned profile. */
  private buildWorkspaceContentGroup(): Element {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('id', 'content');
    const assignments = this.groupProfileAssignments();

    for (const doc of this.documents()) {
      for (const shape of doc.shapes) {
        const assignment = assignments.get(shape.groupKey);
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('id', shape.id);
        path.setAttribute('d', this.hasOffset(shape) ? this.offsetPathData(shape) : this.shapePathData(shape));
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('transform', this.shapeTransform(shape));
        path.setAttribute('fill', this.exportFillForShape(assignment));
        path.setAttribute('stroke', this.exportStrokeForShape(assignment));
        path.setAttribute('stroke-width', '0.3');
        if (assignment) {
          path.setAttribute('profile', assignment.profileId);
        }
        group.appendChild(path);
      }
    }

    return group;
  }

  /** Same rule as `fillForShape`, for the exported file. */
  private exportFillForShape(assignment: GroupProfileAssignment | undefined): string {
    return assignment?.mode === 'FILL' ? assignment.color : 'none';
  }

  /** Same rule as `strokeForShape`, except the "no profile" fallback is a concrete color rather
   * than the app's `var(--p-primary-color)` — a standalone file has no such CSS variable to
   * resolve against. */
  private exportStrokeForShape(assignment: GroupProfileAssignment | undefined): string {
    if (assignment?.mode === 'FILL') {
      return 'transparent';
    }
    return assignment?.color ?? DEFAULT_SHAPE_COLOR;
  }

  private downloadTextFile(content: string, fileName: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }
}
