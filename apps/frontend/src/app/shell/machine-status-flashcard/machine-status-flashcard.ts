import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Divider } from '@openng/optimus-ui/divider';
import { ProgressBar } from '@openng/optimus-ui/progressbar';
import { Tag } from '@openng/optimus-ui/tag';
import { MachineApiService } from '../../features/configuration/machine/machine-api.service';
import { CutterSocketService } from '../../features/operation/machine-status/cutter-socket.service';
import {
  GRBL_STATE_LABELS,
  GRBL_STATE_SEVERITIES,
  StatusSeverity,
} from '../../features/operation/machine-status/machine-status.model';
import { TablerIcon } from '../../shared/tabler-icon/tabler-icon';

/** Menubar-wide "at a glance" summary of the cutter, visible from every page (not just
 * Operation): connection/GRBL state, the currently loaded file, and — while a job is running —
 * its progress and an emergency stop button that cuts communication with the machine immediately
 * (see `CutterSocketService.stopJob()` / the backend's `JobService.stop()`). */
@Component({
  selector: 'app-machine-status-flashcard',
  imports: [Divider, ProgressBar, Tag, TablerIcon],
  templateUrl: './machine-status-flashcard.html',
  styleUrl: './machine-status-flashcard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MachineStatusFlashcard {
  private readonly cutterSocket = inject(CutterSocketService);
  private readonly machineApi = inject(MachineApiService);

  /** Fetched once on load (no push channel for machine settings exists yet) — same convention as
   * `MachineStatusCard`. */
  protected readonly machineName = signal<string | null>(null);

  constructor() {
    this.machineApi.getMachine().subscribe((machine) => this.machineName.set(machine.name));
  }

  /** Same label convention as `MachineStatusCard` on the Operation page, so the two widgets never
   * disagree about what to call the current state. */
  protected readonly stateLabel = computed(() => {
    const status = this.cutterSocket.status();
    if (!status.connected) {
      return 'Disconnected';
    }
    return status.grbl ? GRBL_STATE_LABELS[status.grbl.state] : 'Connected';
  });

  protected readonly stateSeverity = computed<StatusSeverity>(() => {
    const status = this.cutterSocket.status();
    if (!status.connected) {
      return 'secondary';
    }
    return status.grbl ? GRBL_STATE_SEVERITIES[status.grbl.state] : 'success';
  });

  protected readonly fileName = computed(() => this.cutterSocket.gcodeFile()?.fileName ?? null);

  protected readonly jobRunning = computed(() => this.cutterSocket.jobStatus().running);

  protected readonly progressPercent = computed(() => {
    const job = this.cutterSocket.jobStatus();
    return job.totalLines > 0 ? Math.round((job.currentLine / job.totalLines) * 100) : 0;
  });

  /** Emergency stop: no confirmation dialog — a physical e-stop doesn't wait for a "are you sure". */
  protected stop(): void {
    this.cutterSocket.stopJob();
  }
}
