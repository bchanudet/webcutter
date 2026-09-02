import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { TablerIcon } from '../../../shared/tabler-icon/tabler-icon';
import { CutterSocketService } from '../machine-status/cutter-socket.service';

type JogAxis = 'X' | 'Y';

const DEFAULT_STEP_MM = 1;

@Component({
  selector: 'app-position-card',
  imports: [Button, Card, FormsModule, InputNumber, TablerIcon],
  templateUrl: './position-card.html',
  styleUrl: './position-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PositionCard {
  private readonly socket = inject(CutterSocketService);

  /** The laser's machine position (MPos), as last reported by the cutter's status report. */
  protected readonly position = computed(() => this.socket.status().grbl?.machinePosition ?? null);
  protected readonly connected = computed(() => this.socket.status().connected);
  protected readonly stepMm = signal(DEFAULT_STEP_MM);

  protected home(): void {
    this.socket.sendCommand('$H');
  }

  /** Jogs one axis by the configured step, using a transient relative move (G91 ... G90) rather
   * than GRBL's $J jog command, matching the plain G0 commands the machine is already driven
   * with elsewhere — the alarm lock (if engaged) rejects these exactly like any other command. */
  protected jog(axis: JogAxis, direction: 1 | -1): void {
    const distance = direction * this.stepMm();
    this.socket.sendCommand('G91');
    this.socket.sendCommand(`G0 ${axis}${distance}`);
    this.socket.sendCommand('G90');
  }
}
