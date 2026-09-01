import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { ConfirmDialog } from '@openng/optimus-ui/confirmdialog';
import { Tag } from '@openng/optimus-ui/tag';
import { CutterSocketService } from './cutter-socket.service';
import { GrblMachineState } from './machine-status.model';

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
};

@Component({
  selector: 'app-machine-status-card',
  imports: [Button, Card, ConfirmDialog, Tag],
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
