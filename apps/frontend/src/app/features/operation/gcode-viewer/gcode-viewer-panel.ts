import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Message } from '@openng/optimus-ui/message';
import { SelectButton } from '@openng/optimus-ui/selectbutton';
import { Slider } from '@openng/optimus-ui/slider';
import { catchError, map, of, switchMap } from 'rxjs';
import { BedGridCanvas } from '../../../shared/bed-grid/bed-grid-canvas';
import { MachineApiService } from '../../configuration/machine/machine-api.service';
import { Machine } from '@webcutter/shared';
import { GcodeFileService } from '../gcode-file/gcode-file.service';
import { CutterSocketService } from '../machine-status/cutter-socket.service';
import { colorForValue, computeValueRange, GcodeColorMode, ValueRange } from './gcode-color-scale';
import { gcodeToBedPoint, GcodeSegment, GcodeSegmentType, parseGcodeProgram } from './gcode-program-parser';

interface BedSegment {
  type: GcodeSegmentType;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Only set for a G1 segment when `colorMode()` isn't "plain" — G0 always keeps its own fixed
   * dashed-blue style, and "plain" G1 keeps its default solid-red style, both from CSS alone. */
  color: string | null;
}

/** The segment types plus the live laser head marker — all three toggled from the same "visible
 * layers" SelectButton, even though `'HEAD'` isn't a G-code command like the other two. */
type ViewerLayer = GcodeSegmentType | 'HEAD';

const SEGMENT_TYPE_OPTIONS: { label: string; value: ViewerLayer }[] = [
  { label: 'G0 (move)', value: 'G0' },
  { label: 'G1 (cut)', value: 'G1' },
  { label: 'Head', value: 'HEAD' },
];

const COLOR_MODE_OPTIONS: { label: string; value: GcodeColorMode }[] = [
  { label: 'Plain', value: 'plain' },
  { label: 'Speed', value: 'speed' },
  { label: 'Power', value: 'power' },
];

/** Read-only preview of the currently uploaded G-code file, on the same grid/camera as the "Gcode"
 * page (see `BedGridCanvas`): G0 (rapid move) as a dashed blue line, G1 (cut) as a solid red one
 * (or colorized by speed/power — see `colorMode`). The slider below limits how many of the file's
 * commands are drawn, in order — dragging it back to 0 empties the canvas, all the way up draws
 * the whole program. */
@Component({
  selector: 'app-gcode-viewer-panel',
  imports: [BedGridCanvas, FormsModule, Message, SelectButton, Slider],
  templateUrl: './gcode-viewer-panel.html',
  styleUrl: './gcode-viewer-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GcodeViewerPanel {
  private readonly gcodeFile = inject(GcodeFileService);
  private readonly machineApi = inject(MachineApiService);
  private readonly cutterSocket = inject(CutterSocketService);

  protected readonly file = this.gcodeFile.current;
  protected readonly machine = signal<Machine | null>(null);
  protected readonly segments = signal<GcodeSegment[]>([]);
  protected readonly loadError = signal<string | null>(null);
  /** How many of `segments()`, in order, are actually drawn — bound to the slider below. */
  protected readonly sliderValue = signal(0);

  protected readonly segmentTypeOptions = SEGMENT_TYPE_OPTIONS;
  protected readonly colorModeOptions = COLOR_MODE_OPTIONS;

  /** Which layers are drawn at all — independent of the slider, which only limits *how many*
   * (chronologically) G0/G1 segments are considered in the first place; the head marker isn't
   * affected by the slider, it always tracks the cutter's actual live position. */
  protected readonly visibleTypes = signal<ViewerLayer[]>(['G0', 'G1', 'HEAD']);
  protected readonly colorMode = signal<GcodeColorMode>('plain');

  /** Position relative to the cutting surface origin (WPos) — same source and fallback to the raw
   * machine position (MPos) as the sidebar's `PositionCard`, converted into the same bed-mm space
   * every other segment on this canvas is drawn in. `null` until the first status report arrives. */
  protected readonly headPosition = computed<{ x: number; y: number } | null>(() => {
    if (!this.visibleTypes().includes('HEAD')) {
      return null;
    }
    const grbl = this.cutterSocket.status().grbl;
    const position = grbl?.workPosition ?? grbl?.machinePosition ?? null;
    if (!position) {
      return null;
    }
    const machine = this.machine();
    return gcodeToBedPoint({ x: position.x, y: position.y }, machine, machine?.bedHeightMm ?? 100);
  });

  protected readonly totalCommands = computed(() => this.segments().length);

  private readonly g1Segments = computed(() => this.segments().filter((segment) => segment.type === 'G1'));
  /** The color gradient's endpoints always span the *whole* file's G1 segments, not just the ones
   * the slider currently shows — otherwise a segment's color would shift as the slider moves,
   * instead of staying fixed the way "the slowest/weakest cut is blue" implies. */
  private readonly feedRange = computed<ValueRange>(() =>
    computeValueRange(this.g1Segments().map((segment) => segment.feedRate)),
  );
  private readonly powerRange = computed<ValueRange>(() =>
    computeValueRange(this.g1Segments().map((segment) => segment.power)),
  );

  protected readonly visibleSegments = computed<BedSegment[]>(() => {
    const machine = this.machine();
    const bedHeightMm = machine?.bedHeightMm ?? 100;
    const visibleTypes = new Set(this.visibleTypes());
    const colorMode = this.colorMode();
    const feedRange = this.feedRange();
    const powerRange = this.powerRange();

    return this.segments()
      .slice(0, this.sliderValue())
      .filter((segment) => visibleTypes.has(segment.type))
      .map((segment) => ({
        type: segment.type,
        from: gcodeToBedPoint({ x: segment.x1, y: segment.y1 }, machine, bedHeightMm),
        to: gcodeToBedPoint({ x: segment.x2, y: segment.y2 }, machine, bedHeightMm),
        color: this.colorForSegment(segment, colorMode, feedRange, powerRange),
      }));
  });

  constructor() {
    this.machineApi.getMachine().subscribe((machine) => this.machine.set(machine));

    // Re-fetches the file's content whenever it changes (upload/delete, from any browser) — a
    // `switchMap` so a file changing again while a fetch is still in flight can't let a stale
    // response overwrite newer state. Defaults the slider to "show everything" for a freshly
    // loaded file, exactly like GRBL would execute it top to bottom.
    toObservable(this.file)
      .pipe(
        switchMap((file) => {
          if (!file) {
            return of({ segments: [] as GcodeSegment[], error: null as string | null });
          }
          return this.gcodeFile.fetchContent().pipe(
            map(({ content }) => ({ segments: parseGcodeProgram(content), error: null as string | null })),
            catchError(() => of({ segments: [] as GcodeSegment[], error: 'Could not load the G-code file.' })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ segments, error }) => {
        this.segments.set(segments);
        this.sliderValue.set(segments.length);
        this.loadError.set(error);
      });
  }

  private colorForSegment(
    segment: GcodeSegment,
    colorMode: GcodeColorMode,
    feedRange: ValueRange,
    powerRange: ValueRange,
  ): string | null {
    if (segment.type !== 'G1' || colorMode === 'plain') {
      return null;
    }
    return colorMode === 'speed'
      ? colorForValue(segment.feedRate, feedRange)
      : colorForValue(segment.power, powerRange);
  }
}
