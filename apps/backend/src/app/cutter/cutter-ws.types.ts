import { GrblStatus } from '@webcutter/cutter-communication';

/** Broadcast to every client whenever the machine's connection or GRBL-reported state changes. */
export interface MachineStatusPayload {
  connected: boolean;
  /** GRBL's own last known status report (Idle/Run/Home/Alarm/...), null while disconnected or
   * before the first status poll has resolved. */
  grbl: GrblStatus | null;
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
