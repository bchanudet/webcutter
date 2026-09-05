import { HistoryResult } from '@webcutter/shared';
import { StatusSeverity } from '../operation/machine-status/machine-status.model';

/** Human-friendly label for each job outcome — same pattern as `GRBL_STATE_LABELS`. */
export const HISTORY_RESULT_LABELS: Record<HistoryResult, string> = {
  [HistoryResult.SUCCESS]: 'Success',
  [HistoryResult.ERROR]: 'Error',
  [HistoryResult.ABORTED]: 'Aborted',
};

/** Tag/badge severity for each job outcome — same pattern as `GRBL_STATE_SEVERITIES`. */
export const HISTORY_RESULT_SEVERITIES: Record<HistoryResult, StatusSeverity> = {
  [HistoryResult.SUCCESS]: 'success',
  [HistoryResult.ERROR]: 'danger',
  [HistoryResult.ABORTED]: 'warn',
};

/** Concrete CSS color per outcome (the Summary card's MeterGroup needs an actual color, not just a
 * severity keyword) — same green/red/yellow as the rest of the app's severity coloring, e.g.
 * `machine-status-flashcard.scss`'s `var(--p-red-500, #ef4444)`. */
export const HISTORY_RESULT_COLORS: Record<HistoryResult, string> = {
  [HistoryResult.SUCCESS]: 'var(--p-green-500, #22c55e)',
  [HistoryResult.ERROR]: 'var(--p-red-500, #ef4444)',
  [HistoryResult.ABORTED]: 'var(--p-yellow-500, #eab308)',
};
