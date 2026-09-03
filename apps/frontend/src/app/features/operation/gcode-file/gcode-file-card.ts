import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { Message } from '@openng/optimus-ui/message';
import { CutterSocketService } from '../machine-status/cutter-socket.service';
import { describeAlarm } from '../machine-status/machine-status.model';
import { formatFileSize } from './gcode-file.model';
import { GcodeFileService } from './gcode-file.service';

@Component({
  selector: 'app-gcode-file-card',
  imports: [Button, Card, Message],
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
}
