import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { Message } from '@openng/optimus-ui/message';
import { MeterGroup } from '@openng/optimus-ui/metergroup';
import type { MeterItem } from '@openng/optimus-ui/metergroup';
import { HistoryResult, HistorySummary } from '@webcutter/shared';
import { HistoryApiService } from '../history-api.service';
import { HISTORY_RESULT_COLORS, HISTORY_RESULT_LABELS } from '../history-result.model';

/** Proportion of successful/erroneous/aborted jobs among every finished job ever run — see
 * `HistoryApiService.getSummary()`. */
@Component({
  selector: 'app-history-summary-card',
  imports: [Card, Message, MeterGroup],
  templateUrl: './history-summary-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistorySummaryCard {
  private readonly api = inject(HistoryApiService);

  protected readonly summary = signal<HistorySummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly meterItems = computed<MeterItem[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }
    return (
      [
        [HistoryResult.SUCCESS, summary.success],
        [HistoryResult.ERROR, summary.error],
        [HistoryResult.ABORTED, summary.aborted],
      ] as const
    ).map(([result, value]) => ({
      label: HISTORY_RESULT_LABELS[result],
      value,
      color: HISTORY_RESULT_COLORS[result],
    }));
  });

  protected readonly totalJobs = computed(() => this.meterItems().reduce((sum, item) => sum + (item.value ?? 0), 0));

  constructor() {
    this.api.getSummary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load the job summary.');
        this.loading.set(false);
      },
    });
  }
}
