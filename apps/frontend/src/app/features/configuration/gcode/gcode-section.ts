import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { ConfirmationService, PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { ConfirmDialog } from '@openng/optimus-ui/confirmdialog';
import { Message } from '@openng/optimus-ui/message';
import { TableModule } from '@openng/optimus-ui/table';
import { NotificationService } from '../../../shared/notifications/notification.service';
import { TablerIcon } from '../../../shared/tabler-icon/tabler-icon';
import { GcodeApiService } from './gcode-api.service';
import { GcodeFormDialog, GcodeSaveEvent } from './gcode-form-dialog';
import { Gcode } from '@webcutter/shared';

@Component({
  selector: 'app-gcode-section',
  imports: [Card, TableModule, Button, Message, ConfirmDialog, PrimeTemplate, TablerIcon, GcodeFormDialog],
  providers: [ConfirmationService],
  templateUrl: './gcode-section.html',
  styleUrl: './gcode-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GcodeSection {
  private readonly api = inject(GcodeApiService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly notificationService = inject(NotificationService);

  private readonly gcodeDialog = viewChild.required(GcodeFormDialog);

  protected readonly gcodes = signal<Gcode[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.refresh();
  }

  protected openCreate(): void {
    this.gcodeDialog().openForCreate();
  }

  protected openEdit(gcode: Gcode): void {
    this.gcodeDialog().openForEdit(gcode);
  }

  protected onSave(event: GcodeSaveEvent): void {
    const request =
      event.id === null ? this.api.createGcode(event.payload) : this.api.updateGcode(event.id, event.payload);
    request.subscribe({
      next: () => this.refresh(),
      error: () =>
        this.notificationService.notify({
          severity: 'danger',
          origin: 'Gcode blocks',
          summary: 'Save failed',
          message: 'Could not save the G-code.',
        }),
    });
  }

  protected confirmDelete(gcode: Gcode): void {
    this.confirmation.confirm({
      header: 'Delete G-code',
      message: `Delete "${gcode.name}"? This cannot be undone.`,
      accept: () => {
        this.api.deleteGcode(gcode.id).subscribe({
          next: () => this.refresh(),
          error: () =>
            this.notificationService.notify({
              severity: 'danger',
              origin: 'Gcode blocks',
              summary: 'Delete failed',
              message: 'Could not delete the G-code.',
            }),
        });
      },
    });
  }

  private refresh(): void {
    this.loading.set(true);
    this.api.listGcodes().subscribe({
      next: (gcodes) => {
        this.gcodes.set(gcodes);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load the custom G-codes.');
        this.loading.set(false);
      },
    });
  }
}
