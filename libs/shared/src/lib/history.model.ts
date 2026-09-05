// SQLite has no native enum column type, so the result is stored as varchar (see ProfileMode for
// precedent, in ./material.model.ts).
export enum HistoryResult {
  SUCCESS = 'success',
  ERROR = 'error',
  ABORTED = 'aborted',
}

/** Read shape of the backend's `HistoryEntry` TypeORM entity, as returned by the history endpoints —
 * the frontend's type for job history data. A finished entry always has `endDatetime` and `result`
 * set together; both are `null` for a job still in progress (see `JobService`), though the history
 * endpoints only ever return finished entries. */
export interface HistoryEntry {
  id: string;
  /** `null` once the machine this job ran on has since been deleted (`ON DELETE SET NULL` — a
   * history entry must outlive the machine it ran on, e.g. replaced with a new one). */
  machineId: number | null;
  /** Denormalized machine name at read time, so the frontend can show "<Unknown machine>" once
   * `machineId` has gone `null`. */
  machineName: string | null;
  fileName: string;
  fileSizeBytes: number;
  commandCount: number;
  /** 64x64 PNG, base64-encoded (no `data:` URL prefix). */
  thumbnailBase64: string;
  startDatetime: string;
  endDatetime: string | null;
  result: HistoryResult | null;
}

/** Counts of finished jobs by outcome — see `GET /history/summary`. */
export interface HistorySummary {
  success: number;
  error: number;
  aborted: number;
}
