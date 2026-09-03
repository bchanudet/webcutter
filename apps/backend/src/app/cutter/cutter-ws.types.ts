import { GrblStatus } from '@webcutter/cutter-communication';
import { CheckOutcome } from './check.service';

/** Broadcast to every client whenever the machine's connection or GRBL-reported state changes. */
export interface MachineStatusPayload {
  connected: boolean;
  /** GRBL's own last known status report (Idle/Run/Home/Alarm/...), null while disconnected or
   * before the first status poll has resolved. */
  grbl: GrblStatus | null;
  /** Message from the most recent failed `connect` attempt, or from a serial error that occurred
   * while connected (e.g. the device disappearing) — cleared on the next `connect`/`disconnect`.
   * Surfaced so the UI has something more useful to show than "Disconnected" when e.g. the port
   * doesn't exist or the backend's user isn't in the `dialout` group. */
  connectionError: string | null;
}

/** Broadcast to every client whenever a `$C` check run starts or finishes — see `CheckService`. */
export interface CheckStatusPayload {
  running: boolean;
  /** `null` while `running`, or before any check has ever been run. */
  result: CheckOutcome | null;
}

/** Broadcast to every client whenever a cutting job starts, advances, or finishes (see
 * `JobService`) — surfaced app-wide via the menubar flashcard, not just the Operation page.
 * `error` is set only when the job stopped abnormally: a GRBL `error:N`/`ALARM:N` response, or
 * the operator's emergency stop. */
export interface JobStatusPayload {
  running: boolean;
  /** Whether the job is currently on feed hold (see `JobService.pause()`) — only meaningful while
   * `running` is true. */
  paused: boolean;
  fileName: string | null;
  currentLine: number;
  totalLines: number;
  error: string | null;
}

export type SerialMessageDirection = 'sent' | 'received';

/** Broadcast to every client for every single byte sequence written to or read from the cutter's
 * serial port — the raw traffic shown in the Operation page's Terminal tab. `dataBase64` carries
 * the exact bytes (not just text) so the client can fall back to a hex dump for non-ASCII data. */
export interface SerialMessagePayload {
  direction: SerialMessageDirection;
  timestampMs: number;
  dataBase64: string;
}
