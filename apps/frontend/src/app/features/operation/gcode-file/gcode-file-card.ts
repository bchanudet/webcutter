import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { Message } from '@openng/optimus-ui/message';
import { ProgressBar } from '@openng/optimus-ui/progressbar';
import { CutterSocketService } from '../machine-status/cutter-socket.service';
import { describeAlarm } from '../machine-status/machine-status.model';
import { formatFileSize } from './gcode-file.model';
import { GcodeFileService } from './gcode-file.service';

@Component({
  selector: 'app-gcode-file-card',
  imports: [Button, Card, Message, ProgressBar],
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

  protected readonly jobProgressPercent = computed(() => {
    const job = this.cutterSocket.jobStatus();
    return job.totalLines > 0 ? Math.round((job.currentLine / job.totalLines) * 100) : 0;
  });

  /** Text for the last job's failure, or `null` if it's still running or never failed — the
   * global progress/success case is already visible via the menubar flashcard, so this only
   * needs to surface an abnormal stop (a GRBL `error:N`, or the operator's emergency stop). */
  protected readonly jobError = computed<string | null>(() => {
    const status = this.cutterSocket.jobStatus();
    return status.running ? null : status.error;
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
   * this card additionally offers pause/resume while on the Operation page. */
  protected startJob(): void {
    this.cutterSocket.startJob();
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
