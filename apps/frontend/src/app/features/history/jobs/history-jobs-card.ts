import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Card } from '@openng/optimus-ui/card';
import { DataView } from '@openng/optimus-ui/dataview';
import { DatePicker } from '@openng/optimus-ui/datepicker';
import { Message } from '@openng/optimus-ui/message';
import { SelectButton } from '@openng/optimus-ui/selectbutton';
import { Tag } from '@openng/optimus-ui/tag';
import { Timeline } from '@openng/optimus-ui/timeline';
import { HistoryEntry, HistoryResult } from '@webcutter/shared';
import { formatFileSize } from '../../operation/gcode-file/gcode-file.model';
import { StatusSeverity } from '../../operation/machine-status/machine-status.model';
import { HistoryApiService } from '../history-api.service';
import { HISTORY_RESULT_LABELS, HISTORY_RESULT_SEVERITIES } from '../history-result.model';

type JobsViewMode = 'dataview' | 'timeline';

const VIEW_MODE_OPTIONS: { label: string; value: JobsViewMode }[] = [
  { label: 'Dataview', value: 'dataview' },
  { label: 'Timeline', value: 'timeline' },
];

/** Lists every finished job (see `HistoryApiService.listEntries()`), optionally narrowed to a
 * from/to start-date range, as either a `DataView` grid or a `Timeline` (see `viewMode`). */
@Component({
  selector: 'app-history-jobs-card',
  imports: [
    Card,
    DatePipe,
    FormsModule,
    DatePicker,
    DataView,
    Timeline,
    SelectButton,
    Message,
    Tag,
    PrimeTemplate,
  ],
  templateUrl: './history-jobs-card.html',
  styleUrl: './history-jobs-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryJobsCard {
  private readonly api = inject(HistoryApiService);

  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);
  protected readonly viewMode = signal<JobsViewMode>('dataview');
  protected readonly viewModeOptions = VIEW_MODE_OPTIONS;

  protected readonly entries = signal<HistoryEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly formatFileSize = formatFileSize;

  constructor() {
    this.refresh();
  }

  protected onFromChange(value: Date | null): void {
    this.from.set(value);
    this.refresh();
  }

  protected onToChange(value: Date | null): void {
    this.to.set(value);
    this.refresh();
  }

  protected thumbnailSrc(entry: HistoryEntry): string {
    return `data:image/png;base64,${entry.thumbnailBase64}`;
  }

  protected machineLabel(entry: HistoryEntry): string {
    return entry.machineName ?? '<Unknown machine>';
  }

  /** `entry.result` is always non-null for a finished job (the only kind `listEntries()` returns)
   * — these take `HistoryResult | null` (rather than exposing `HISTORY_RESULT_LABELS`/
   * `HISTORY_RESULT_SEVERITIES` directly to the template) purely so the enum-keyed `Record` lookup
   * happens against a properly typed parameter, not the untyped `any` a PrimeNG template context
   * variable (`let-entry`) resolves to — indexing directly in the template trips `noImplicitAny`. */
  protected resultLabel(result: HistoryResult | null): string {
    return result ? HISTORY_RESULT_LABELS[result] : '';
  }

  protected resultSeverity(result: HistoryResult | null): StatusSeverity | undefined {
    return result ? HISTORY_RESULT_SEVERITIES[result] : undefined;
  }

  private refresh(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api.listEntries(this.from(), this.to()).subscribe({
      next: (entries) => {
        this.entries.set(entries);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load the job history.');
        this.loading.set(false);
      },
    });
  }
}
