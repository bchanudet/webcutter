import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Message } from '@openng/optimus-ui/message';
import { Tag } from '@openng/optimus-ui/tag';
import { MachineApiService } from '../../configuration/machine/machine-api.service';
import { CutterSocketService } from './cutter-socket.service';
import { describeAlarm, GRBL_STATE_LABELS, GRBL_STATE_SEVERITIES, StatusSeverity } from './machine-status.model';
import { PanelModule } from '@openng/optimus-ui/panel';

/** No Connect/Disconnect controls: `AutoConnectService` on the backend opens the connection on its
 * own the moment the configured serial port is available, and re-opens it just as fast after any
 * disconnection — a manual button would either do nothing (already about to auto-connect) or be
 * undone within about a second (a "disconnect" immediately auto-reconnecting), so this card is
 * read-only status now. */
@Component({
  selector: 'app-machine-status-card',
  imports: [Message, Tag, PanelModule],
  templateUrl: './machine-status-card.html',
  styleUrl: './machine-status-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MachineStatusCard {
  private readonly socket = inject(CutterSocketService);
  private readonly machineApi = inject(MachineApiService);

  /** Fetched once on load (no push channel for machine settings exists yet) — used as the card's
   * header so this widget reads as "your machine's status", not just a generic "Machine" label. */
  protected readonly machineName = signal<string | null>(null);

  protected readonly status = this.socket.status;

  protected readonly statusLabel = computed(() => {
    const status = this.status();
    if (!status.connected) {
      return 'Disconnected';
    }
    return status.grbl ? GRBL_STATE_LABELS[status.grbl.state] : 'Connected';
  });

  protected readonly statusSeverity = computed<StatusSeverity>(() => {
    const status = this.status();
    if (!status.connected) {
      return 'secondary';
    }
    return status.grbl ? GRBL_STATE_SEVERITIES[status.grbl.state] : 'success';
  });

  /** Whether the browser's own WebSocket to the backend is up — distinct from `status().connected`
   * (the backend's link to the cutter itself), and takes priority in the UI since every other
   * signal here is stale while it's down. */
  protected readonly wsConnected = this.socket.wsConnected;

  protected readonly connectionError = computed(() => this.status().connectionError);

  /** A human-readable reason for the current alarm, if the state is "Alarm" and we know one — `null`
   * otherwise, including while alarmed for an unknown reason (e.g. the machine was already alarmed
   * before this session connected). */
  protected readonly alarmReason = computed(() => {
    const grbl = this.status().grbl;
    return grbl?.state === 'Alarm' ? describeAlarm(grbl.alarmCode) : null;
  });

  constructor() {
    this.machineApi.getMachine().subscribe((machine) => this.machineName.set(machine.name));
  }
}
