import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HistoryJobsCard } from './jobs/history-jobs-card';
import { HistorySummaryCard } from './summary/history-summary-card';

@Component({
  selector: 'app-history-page',
  imports: [HistorySummaryCard, HistoryJobsCard],
  templateUrl: './history.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage {}
