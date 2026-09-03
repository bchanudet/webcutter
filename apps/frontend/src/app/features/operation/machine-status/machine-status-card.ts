import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { ConfirmDialog } from '@openng/optimus-ui/confirmdialog';
import { Message } from '@openng/optimus-ui/message';
import { Tag } from '@openng/optimus-ui/tag';
import { CutterSocketService } from './cutter-socket.service';
import { describeAlarm, GrblMachineState } from './machine-status.model';

type StatusSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary';

const GRBL_STATE_LABELS: Record<GrblMachineState, string> = {
  Idle: 'Idle',
  Run: 'Processing',
  Hold: 'Hold',
  Jog: 'Jogging',
  Alarm: 'Alarm',
  Door: 'Door open',
  Check: 'Check mode',
  Home: 'Homing',
  Sleep: 'Sleep',
  Framing: 'Framing',
};

const GRBL_STATE_SEVERITIES: Record<GrblMachineState, StatusSeverity> = {
  Idle: 'success',
  Run: 'info',
  Hold: 'warn',
  Jog: 'info',
  Alarm: 'danger',
  Door: 'danger',
  Check: 'secondary',
  Home: 'info',
  Sleep: 'secondary',
  Framing: 'warn',
};

@Component({
  selector: 'app-machine-status-card',
  imports: [Button, Card, ConfirmDialog, Message, Tag],
  providers: [ConfirmationService],
  templateUrl: './machine-status-card.html',
  styleUrl: './machine-status-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MachineStatusCard {
  private readonly socket = inject(CutterSocketService);
  private readonly confirmation = inject(ConfirmationService);

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

  protected connect(): void {
    this.socket.connect();
  }

  protected confirmDisconnect(): void {
    this.confirmation.confirm({
      header: 'Disconnect cutter',
      message: 'Disconnect the machine? Any operation in progress will be interrupted.',
      accept: () => this.socket.disconnect(),
    });
  }
}
