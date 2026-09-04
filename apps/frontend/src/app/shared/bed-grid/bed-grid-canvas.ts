import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, signal, viewChild } from '@angular/core';
import { GcodeOrigin, Machine } from '@webcutter/shared';

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Renders the machine's cutting surface as an SVG grid — major lines every 10mm, minor every 1mm,
 * axis arrows, origin dot, ruler legends along the bottom/left edges — with pan (middle-click drag)
 * and zoom (wheel) already wired up, and projects `<ng-content>` on top of it in the same mm-space
 * coordinate system. Shared by the "Gcode" page's editable canvas and the Operation page's
 * read-only G-code viewer, which both need the exact same grid/camera but very different content
 * layers (draggable SVG shapes vs. a plain G-code toolpath trace) — this component owns only the
 * grid and the camera, nothing about what's drawn on top of it. */
@Component({
  selector: 'app-bed-grid-canvas',
  templateUrl: './bed-grid-canvas.html',
  styleUrl: './bed-grid-canvas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BedGridCanvas {
  readonly machine = input<Machine | null>(null);
  /** Emitted when the background (i.e. not whatever is projected on top) is clicked — e.g. so a
   * host with a selection concept can clear it. */
  readonly backgroundClick = output<MouseEvent>();

  private readonly svgCanvas = viewChild.required<ElementRef<SVGSVGElement>>('svgCanvas');

  protected readonly surfaceWidthMm = computed(() => this.machine()?.bedWidthMm ?? 100);
  protected readonly surfaceHeightMm = computed(() => this.machine()?.bedHeightMm ?? 100);

  /** Visible mm-space window into the canvas — the pan/zoom "camera", independent of the bed's own
   * dimensions above. */
  private readonly viewBoxState = signal<ViewBox>({ x: 0, y: 0, width: 100, height: 100 });
  protected readonly viewBox = this.viewBoxState.asReadonly();

  /** Position of the selected origin corner (or center) on the canvas, in mm — purely cosmetic
   * (the axis arrows and grid ruler legend anchor to it), unaffected by `offsetXMm`/`offsetYMm`:
   * the arrows and legend describe the fixed grid itself, not where a command actually lands, so
   * they stay put along the grid's own edge — see `homePoint` for the offset-aware marker. */
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
   * `originPoint`: the machine's own origin offset (`Machine.offsetXMm`/`offsetYMm`) means G-code's
   * `(0, 0)` doesn't sit at the grid's corner once an offset is configured. Inverts
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

  private panState: {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startView: ViewBox;
    mmPerPixelX: number;
    mmPerPixelY: number;
  } | null = null;

  constructor() {
    // Frames the whole bed once its real dimensions load (only fires again if they later change).
    effect(() => {
      const width = this.surfaceWidthMm();
      const height = this.surfaceHeightMm();
      this.viewBoxState.set({ x: 0, y: 0, width, height });
    });
  }

  /** Resets the pan/zoom camera back to framing the whole bed. */
  resetView(): void {
    this.viewBoxState.set({ x: 0, y: 0, width: this.surfaceWidthMm(), height: this.surfaceHeightMm() });
  }

  /** Converts a client (screen) point to mm-space, accounting for the current pan/zoom — public so
   * a host projecting interactive content (e.g. draggable shapes) can convert its own pointer
   * events the same way this component does internally. */
  clientToSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
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

  private buildGridLegend(lengthMm: number, originMm: number): { pos: number; label: number }[] {
    const ticks: { pos: number; label: number }[] = [];
    for (let pos = 0; pos <= lengthMm; pos += 10) {
      ticks.push({ pos, label: Math.round(Math.abs(pos - originMm)) });
    }
    return ticks;
  }

  protected onBackgroundClick(event: MouseEvent): void {
    this.backgroundClick.emit(event);
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

    this.viewBoxState.set(
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
    this.viewBoxState.set(
      this.clampView({ ...pan.startView, x: pan.startView.x - dx, y: pan.startView.y - dy }),
    );
  }

  protected onCanvasPointerUp(event: PointerEvent): void {
    if (this.panState?.pointerId === event.pointerId) {
      this.panState = null;
    }
  }

  /** Keeps the view from drifting arbitrarily far from the bed — allows up to one view's worth of
   * empty margin around it in every direction. */
  private clampView(view: ViewBox): ViewBox {
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
}
