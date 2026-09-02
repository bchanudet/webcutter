import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { CutterSocketService } from '../machine-status/cutter-socket.service';
import { formatFileSize } from './gcode-file.model';
import { GcodeFileService } from './gcode-file.service';

@Component({
  selector: 'app-gcode-file-card',
  imports: [Button, Card],
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

  /** Traces the current file's bounding box at low laser power so the user can check it actually
   * fits the material — see `FramingService` on the backend. Toggles to "Stop" while running. */
  protected toggleFrame(): void {
    if (this.framing()) {
      this.cutterSocket.stopFrame();
    } else {
      this.cutterSocket.startFrame();
    }
  }
}
