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
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { PrimeTemplate, TreeNode } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { Message } from '@openng/optimus-ui/message';
import { Select } from '@openng/optimus-ui/select';
import { Splitter } from '@openng/optimus-ui/splitter';
import { Toolbar } from '@openng/optimus-ui/toolbar';
import { Tree } from '@openng/optimus-ui/tree';
import { TablerIcon } from '../../shared/tabler-icon/tabler-icon';
import { Material, Profile } from '../configuration/materials/material.model';
import { MaterialsApiService } from '../configuration/materials/materials-api.service';
import { GcodeOrigin, Machine } from '../configuration/machine/machine.model';
import { MachineApiService } from '../configuration/machine/machine-api.service';
import { FlattenedShape, SvgFlattenerService, SvgTreeNodeData } from './svg-flattener.service';
import { GcodeGeneratorService } from './gcode-generator.service';

interface CuttingParamsForm {
  targetWidthMm: FormControl<number>;
  feedRateMmMin: FormControl<number>;
  laserPower: FormControl<number>;
  passes: FormControl<number>;
}

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

function scaleMatrix(s: number): AffineMatrix {
  return { a: s, b: 0, c: 0, d: s, e: 0, f: 0 };
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

interface WorkspaceDocument {
  id: string;
  fileName: string;
  source: string;
  width: number;
  height: number;
  shapes: FlattenedShape[];
  skippedTags: string[];
  treeNode: TreeNode<SvgTreeNodeData>;
}

@Component({
  selector: 'app-svg-to-gcode-page',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    PrimeTemplate,
    Button,
    Card,
    Message,
    Select,
    Splitter,
    Toolbar,
    Tree,
    TablerIcon,
  ],
  templateUrl: './svg-to-gcode.page.html',
  styleUrl: './svg-to-gcode.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgToGcodePage {
  private readonly flattener = inject(SvgFlattenerService);
  private readonly gcodeGenerator = inject(GcodeGeneratorService);
  private readonly materialsApi = inject(MaterialsApiService);
  private readonly machineApi = inject(MachineApiService);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly svgCanvas = viewChild.required<ElementRef<SVGSVGElement>>('svgCanvas');
  private nextDocumentId = 0;
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

  protected readonly machine = signal<Machine | null>(null);
  // Fallback cutting surface until the machine configuration has loaded.
  protected readonly surfaceWidthMm = computed(() => this.machine()?.bedWidthMm ?? 100);
  protected readonly surfaceHeightMm = computed(() => this.machine()?.bedHeightMm ?? 100);

  protected readonly documents = signal<WorkspaceDocument[]>([]);
  protected readonly selectedNodes = signal<TreeNode<SvgTreeNodeData>[]>([]);
  protected readonly gcode = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly materials = signal<Material[]>([]);
  protected readonly selectedMaterialId = signal<number | null>(null);
  /** Colors assigned to tree node keys (documents/groups) by clicking a profile. */
  protected readonly groupProfileColors = signal<Map<string, string>>(new Map());
  /** Move/rotate transform, in mm, keyed by tree node key — applied on top of a shape's own points. */
  protected readonly groupTransforms = signal<Map<string, AffineMatrix>>(new Map());

  protected readonly treeNodes = computed(() => this.documents().map((doc) => doc.treeNode));
  protected readonly skippedTags = computed(() =>
    Array.from(new Set(this.documents().flatMap((doc) => doc.skippedTags))),
  );
  /** Checkbox-selected tree node keys (documents and groups) — Optimus Tree propagates checks
   * up/down by default, so a checked ancestor's descendants are already included here too. */
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
      points: corners.map((p) => `${p.x},${p.y}`).join(' '),
      handle: corners[1],
      center,
      angleDeg,
      handleSize: this.handleSizeMm(),
    };
  });

  /** Position of the machine origin on the canvas, in mm. SVG y grows downward, so "up" on
   * the bed (Y+ in the usual GRBL bottom-left convention) is the -y direction here. */
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

  protected readonly materialOptions = computed(() =>
    this.materials().map((material) => ({
      label: `${material.name} (${material.thicknessMm} mm)`,
      value: material.id,
    })),
  );
  protected readonly selectedMaterial = computed(
    () => this.materials().find((material) => material.id === this.selectedMaterialId()) ?? null,
  );
  protected readonly profiles = computed(() => this.selectedMaterial()?.profiles ?? []);

  protected readonly form = new FormGroup<CuttingParamsForm>({
    targetWidthMm: new FormControl(100, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    feedRateMmMin: new FormControl(600, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    laserPower: new FormControl(300, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(1000)],
    }),
    passes: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(20)],
    }),
  });

  constructor() {
    this.materialsApi.listMaterials().subscribe((materials) => this.materials.set(materials));
    this.machineApi.getMachine().subscribe((machine) => this.machine.set(machine));

    // Re-anchors the selection frame whenever the set of selected groups actually changes
    // (selecting/deselecting), not while dragging — dragging never touches `selectedNodes`.
    effect(() => {
      const keys = this.selectedGroupKeys();
      this.selectionBaseFrame.set(this.computeBaseFrame(keys));
      this.selectionFrameTransform.set(IDENTITY_MATRIX);
    });
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

  async onFileInputChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    this.errorMessage.set(null);
    this.gcode.set(null);

    try {
      const source = await file.text();
      const id = `doc-${this.nextDocumentId++}`;
      const result = this.flattener.flatten(id, source, file.name);

      const workspaceDocument: WorkspaceDocument = {
        id,
        fileName: file.name,
        source,
        width: result.width,
        height: result.height,
        shapes: result.shapes,
        skippedTags: result.skippedTags,
        treeNode: result.tree,
      };

      const isFirstDocument = this.documents().length === 0;
      this.documents.update((docs) => [...docs, workspaceDocument]);
      if (isFirstDocument) {
        this.form.controls.targetWidthMm.setValue(Math.round(result.width) || 100);
      }

      if (result.shapes.length === 0) {
        this.errorMessage.set(`No cuttable shape (path, rect, circle...) found in "${file.name}".`);
      }
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Could not read this SVG file.',
      );
    }
  }

  /** Scale factor from a document's own units to the millimeters shown on the grid. */
  protected previewScaleFor(document: WorkspaceDocument): number {
    if (document.width <= 0) {
      return 1;
    }
    return this.form.controls.targetWidthMm.value / document.width;
  }

  protected toPolylinePoints(shape: FlattenedShape): string {
    return shape.points.map((point) => `${point.x},${point.y}`).join(' ');
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

  /** Combines a shape's own document scale with its group's current move/rotate transform. */
  protected shapeTransform(shape: FlattenedShape, document: WorkspaceDocument): string {
    const group = this.groupTransforms().get(shape.groupKey) ?? IDENTITY_MATRIX;
    const scale = this.previewScaleFor(document);
    return matrixToAttr(multiplyMatrices(group, scaleMatrix(scale)));
  }

  /** Starts dragging the current selection when the user presses down on one of its shapes. */
  protected onShapePointerDown(event: PointerEvent, shape: FlattenedShape): void {
    if (!this.isShapeSelected(shape)) {
      return;
    }

    const groupKeys = Array.from(this.selectedGroupKeys());
    const bbox = this.computeSelectionWorldBBox(this.selectedGroupKeys());
    if (!bbox) {
      return;
    }

    event.preventDefault();
    this.dragMoved = false;
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
    event.preventDefault();
    event.stopPropagation();

    const frame = this.selectionFrame();
    if (!frame) {
      return;
    }

    const start = this.clientToSvgPoint(event.clientX, event.clientY);
    this.dragMoved = false;
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
      step = rotateMatrix(currentAngleDeg - drag.startAngleDeg, drag.pivot.x, drag.pivot.y);
    } else if (drag.bbox) {
      const dx = this.clampDelta(
        current.x - drag.startPoint.x,
        drag.bbox.minX,
        drag.bbox.maxX,
        this.surfaceWidthMm(),
      );
      const dy = this.clampDelta(
        current.y - drag.startPoint.y,
        drag.bbox.minY,
        drag.bbox.maxY,
        this.surfaceHeightMm(),
      );
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
    }
  }

  /** Clamps a drag delta so the dragged bounding box [min, max] stays within [0, limit]. */
  private clampDelta(delta: number, min: number, max: number, limit: number): number {
    const minDelta = -min;
    const maxDelta = limit - max;
    if (minDelta > maxDelta) {
      return 0;
    }
    return Math.min(Math.max(delta, minDelta), maxDelta);
  }

  private clientToSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.svgCanvas().nativeElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 };
    }
    const scaleX = this.surfaceWidthMm() / rect.width;
    const scaleY = this.surfaceHeightMm() / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
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
      const scale = this.previewScaleFor(document);
      for (const shape of document.shapes) {
        if (!groupKeys.has(shape.groupKey)) {
          continue;
        }
        const matrix = multiplyMatrices(
          this.groupTransforms().get(shape.groupKey) ?? IDENTITY_MATRIX,
          scaleMatrix(scale),
        );
        for (const point of shape.points) {
          found = true;
          const p = applyMatrix(matrix, point);
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
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
      const scale = this.previewScaleFor(document);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let found = false;

      for (const shape of document.shapes) {
        if (shape.groupKey !== groupKey) {
          continue;
        }
        for (const point of shape.points) {
          found = true;
          const x = point.x * scale;
          const y = point.y * scale;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }

      if (found) {
        return { minX, minY, maxX, maxY };
      }
    }
    return null;
  }

  protected colorForShape(shape: FlattenedShape): string {
    return this.groupProfileColors().get(shape.groupKey) ?? 'var(--p-primary-color, #FF7300)';
  }

  /** Applies a profile's color to the tree nodes currently checked in the workspace tree. */
  protected applyProfile(profile: Profile): void {
    const keys = this.selectedGroupKeys();
    if (keys.size === 0) {
      return;
    }
    this.groupProfileColors.update((colors) => {
      const next = new Map(colors);
      for (const key of keys) {
        next.set(key, profile.color);
      }
      return next;
    });
  }

  protected onMaterialChange(materialId: number | null): void {
    this.selectedMaterialId.set(materialId);
  }

  generate(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const cuttableDocuments = this.documents().filter((doc) => doc.shapes.length > 0);
    if (cuttableDocuments.length === 0) {
      this.errorMessage.set('No cuttable shape found in the workspace.');
      return;
    }

    try {
      const params = this.form.getRawValue();
      const outputs = cuttableDocuments.map((doc) =>
        this.gcodeGenerator.generate(doc.shapes, doc.width, doc.height, params),
      );
      this.gcode.set(outputs.join('\n\n'));
      this.errorMessage.set(null);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Could not generate the G-code.',
      );
    }
  }

  downloadGcode(): void {
    const gcode = this.gcode();
    if (!gcode) {
      return;
    }

    this.downloadTextFile(gcode, 'workspace.gcode', 'text/plain');
  }

  saveSvg(): void {
    const documents = this.documents();
    if (documents.length === 0) {
      return;
    }

    this.downloadTextFile(this.buildConcatenatedSvg(documents), 'workspace.svg', 'image/svg+xml');
  }

  reset(): void {
    this.documents.set([]);
    this.selectedNodes.set([]);
    this.gcode.set(null);
    this.errorMessage.set(null);
    this.groupProfileColors.set(new Map());
    this.groupTransforms.set(new Map());
    this.form.reset({ targetWidthMm: 100, feedRateMmMin: 600, laserPower: 300, passes: 1 });
  }

  /** Combines every loaded document into a single file, each kept in its own nested <svg>. */
  private buildConcatenatedSvg(documents: WorkspaceDocument[]): string {
    const serializer = new XMLSerializer();
    const nested = documents
      .map((doc) => {
        const parsed = new DOMParser().parseFromString(doc.source, 'image/svg+xml');
        const inner = Array.from(parsed.documentElement.children)
          .map((child) => serializer.serializeToString(child))
          .join('');
        return `<svg viewBox="0 0 ${doc.width} ${doc.height}" width="${doc.width}" height="${doc.height}">${inner}</svg>`;
      })
      .join('\n');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.surfaceWidthMm()} ${this.surfaceHeightMm()}">\n${nested}\n</svg>`;
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
