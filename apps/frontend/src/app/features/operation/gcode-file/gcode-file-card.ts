import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { Button } from '@openng/optimus-ui/button';
import { Message } from '@openng/optimus-ui/message';
import { ProgressBar } from '@openng/optimus-ui/progressbar';
import { CutterSocketService } from '../machine-status/cutter-socket.service';
import { describeAlarm } from '../machine-status/machine-status.model';
import { formatElapsedMs, formatFileSize } from './gcode-file.model';
import { GcodeFileService } from './gcode-file.service';
import { PanelModule } from '@openng/optimus-ui/panel';
import { renderGcodeThumbnail } from '../gcode-viewer/gcode-thumbnail';

/** How often the displayed elapsed time refreshes while the stopwatch is actively counting —
 * seconds-level granularity is all a "how long has this cut been running" readout needs. */
const STOPWATCH_TICK_MS = 1000;

@Component({
  selector: 'app-gcode-file-card',
  imports: [Button, PanelModule, Message, ProgressBar],
  templateUrl: './gcode-file-card.html',
  styleUrl: './gcode-file-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GcodeFileCard {
  private readonly gcodeFile = inject(GcodeFileService);
  private readonly cutterSocket = inject(CutterSocketService);

  protected readonly file = this.gcodeFile.current;
  protected readonly formatFileSize = formatFileSize;

  protected readonly connected = computed(() => this.cutterSocket.status().connected);
  protected readonly framing = computed(() => this.cutterSocket.status().grbl?.state === 'Framing');
  protected readonly checking = computed(() => this.cutterSocket.checkStatus().running);
  protected readonly jobRunning = computed(() => this.cutterSocket.jobStatus().running);
  protected readonly jobPaused = computed(() => this.cutterSocket.jobStatus().paused);

  /** Feed hold ('Hold') or the safety door being open ('Door') pause the job just as surely as our
   * own "Pause" button does (GRBL itself stops executing either way) — the stopwatch should pause
   * for all three reasons alike, not just the one the user actually clicked. */
  private readonly machineOnHold = computed(() => {
    const state = this.cutterSocket.status().grbl?.state;
    return state === 'Hold' || state === 'Door';
  });
  private readonly stopwatchPaused = computed(() => this.jobPaused() || this.machineOnHold());

  /** Total active (non-paused) milliseconds elapsed since the current job's "Start" — frozen (not
   * reset) once the job stops, so the final duration stays readable until a new job starts. */
  private readonly accumulatedMs = signal(0);
  /** Wall-clock time the current active (unpaused) stretch began, or `null` while paused/stopped —
   * folded into `accumulatedMs` every time it ends (see `foldActiveSegment`). */
  private readonly activeSinceMs = signal<number | null>(null);
  /** Ticks every `STOPWATCH_TICK_MS` purely to force `elapsedMs` to recompute while counting —
   * irrelevant while `activeSinceMs()` is null, since that branch doesn't read it. */
  private readonly clockTickMs = signal(Date.now());
  protected readonly stopwatchVisible = signal(false);

  protected readonly elapsedMs = computed(() => {
    const since = this.activeSinceMs();
    return this.accumulatedMs() + (since !== null ? this.clockTickMs() - since : 0);
  });
  protected readonly elapsedLabel = computed(() => formatElapsedMs(this.elapsedMs()));

  private previousJobRunning = false;
  private previousStopwatchPaused = false;
  private previousFileName: string | null = null;

  constructor() {
    const tick = setInterval(() => this.clockTickMs.set(Date.now()), STOPWATCH_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));

    // Drives the whole stopwatch off the *edges* of `jobRunning`/`stopwatchPaused` rather than
    // their current value alone — e.g. "still running" on its own says nothing about whether a
    // fresh Start just happened (reset to 0) or this is the 100th tick of an already-long job
    // (must NOT reset). Comparing against the previous value (tracked in plain fields, since an
    // effect has no memory of its own between runs) is what tells those apart.
    effect(() => {
      const running = this.jobRunning();
      const paused = this.stopwatchPaused();
      const now = Date.now();

      if (running && !this.previousJobRunning) {
        this.accumulatedMs.set(0);
        this.stopwatchVisible.set(true);
        this.activeSinceMs.set(paused ? null : now);
      } else if (!running && this.previousJobRunning) {
        this.foldActiveSegment(now);
      } else if (running && paused && !this.previousStopwatchPaused) {
        this.foldActiveSegment(now);
      } else if (running && !paused && this.previousStopwatchPaused) {
        this.activeSinceMs.set(now);
      }

      this.previousJobRunning = running;
      this.previousStopwatchPaused = paused;
    });

    // A different file (new upload, or deleted) makes the frozen time from a previous run
    // meaningless — hide the stopwatch until the next "Start" gives it something real to show.
    // Compares against the *previous* file name rather than resetting on every run of this effect,
    // since `jobRunning()` (read below) changing at the end of a job would otherwise immediately
    // wipe the very state the other effect just froze for the same file.
    effect(() => {
      const fileName = this.file()?.fileName ?? null;
      if (fileName === this.previousFileName) {
        return;
      }
      this.previousFileName = fileName;
      if (!this.jobRunning()) {
        this.stopwatchVisible.set(false);
        this.accumulatedMs.set(0);
        this.activeSinceMs.set(null);
      }
    });
  }

  /** Adds however long the current active stretch has lasted to `accumulatedMs` and clears
   * `activeSinceMs` — a no-op on the latter if it's already `null` (e.g. the job ended while
   * already paused). */
  private foldActiveSegment(now: number): void {
    const since = this.activeSinceMs();
    if (since !== null) {
      this.accumulatedMs.update((ms) => ms + (now - since));
    }
    this.activeSinceMs.set(null);
  }

  protected readonly jobProgressPercent = computed(() => {
    const job = this.cutterSocket.jobStatus();
    return job.totalLines > 0 ? Math.round((job.currentLine / job.totalLines) * 100) : 0;
  });

  /** Text + severity for the last check's outcome, or `null` before any check has run. Decodes
   * `alarmCode` into a human reason when the failure was a real GRBL alarm rather than a plain
   * `error:N` on one line (see `CheckService` on the backend). */
  protected readonly checkResult = computed<{ text: string; severity: 'success' | 'error' } | null>(() => {
    const result = this.cutterSocket.checkStatus().result;
    if (!result) {
      return null;
    }
    const text = result.ok ? result.message : (describeAlarm(result.alarmCode) ?? result.message);
    return { text, severity: result.ok ? 'success' : 'error' };
  });

  /** Traces the current file's bounding box at low laser power so the user can check it actually
   * fits the material — see `FramingService` on the backend. Toggles to "Stop" while running.
   * Mutually exclusive with `runCheck()`: both drive the machine's single command queue. */
  protected toggleFrame(): void {
    if (this.framing()) {
      this.cutterSocket.stopFrame();
    } else {
      this.cutterSocket.startFrame();
    }
  }

  /** Runs the current file through GRBL's own Check mode ($C) — validates every line (including
   * travel limits) without moving the head or firing the laser. See `CheckService`. */
  protected runCheck(): void {
    this.cutterSocket.startCheck();
  }

  /** Streams the current file to the cutter — see the backend's `JobService`. A compact summary
   * (state, progress, emergency stop) also stays visible from any page via the menubar flashcard;
   * this card additionally offers pause/resume while on the Operation page.
   *
   * Renders a thumbnail from the file's own toolpath (see `renderGcodeThumbnail()`) rather than
   * screenshotting the Viewer tab, since that tab may not even be mounted right now (the Operation
   * page's three tabs share one `<router-outlet>`) — falls back to no thumbnail rather than blocking
   * the job if fetching the file's content fails. */
  protected startJob(): void {
    this.gcodeFile.fetchContent().subscribe({
      next: ({ content }) => this.cutterSocket.startJob(renderGcodeThumbnail(content)),
      error: () => this.cutterSocket.startJob(''),
    });
  }

  /** Feed hold / cycle start — the in-flight move (if any) still completes being queued, but GRBL
   * won't execute it (or send anything further) until resumed. See `JobService.pause()`. */
  protected togglePauseJob(): void {
    if (this.jobPaused()) {
      this.cutterSocket.resumeJob();
    } else {
      this.cutterSocket.pauseJob();
    }
  }

  /** Emergency stop: no confirmation dialog — a physical e-stop doesn't wait for a "are you sure". */
  protected abortJob(): void {
    this.cutterSocket.stopJob();
  }
}
