import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from '@openng/optimus-ui/button';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { TablerIcon } from '../../../shared/tabler-icon/tabler-icon';
import { CutterSocketService } from '../machine-status/cutter-socket.service';
import { PanelModule } from '@openng/optimus-ui/panel';
import { InputGroupModule } from '@openng/optimus-ui/inputgroup';
import { InputGroupAddonModule } from '@openng/optimus-ui/inputgroupaddon';

type JogAxis = 'X' | 'Y';

const DEFAULT_STEP_MM = 1;

@Component({
  selector: 'app-position-card',
  imports: [Button, PanelModule, FormsModule, InputNumber, TablerIcon, InputGroupModule, InputGroupAddonModule],
  templateUrl: './position-card.html',
  styleUrl: './position-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PositionCard {
  private readonly socket = inject(CutterSocketService);

  /** Position relative to the cutting surface origin (WPos), as last reported by the cutter's
   * status report — falls back to the raw machine position (MPos) if the board's status report
   * mask ($10) isn't configured to include WPos, so the card still shows something rather than
   * nothing. WPos is negative whenever the head is to the left of/below the surface origin, which
   * is expected and not an error. */
  protected readonly position = computed(() => {
    const grbl = this.socket.status().grbl;
    return grbl?.workPosition ?? grbl?.machinePosition ?? null;
  });
  protected readonly connected = computed(() => this.socket.status().connected);
  /** Movement (jog + home) is disabled while a cutting job is running — the operator's only way
   * to intervene at that point is the "Abort" button on the Gcode file card. */
  protected readonly jobRunning = computed(() => this.socket.jobStatus().running);
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
