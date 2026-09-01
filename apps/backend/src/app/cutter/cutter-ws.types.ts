import { GrblStatus } from '@webcutter/cutter-communication';

/** Broadcast to every client whenever the machine's connection or GRBL-reported state changes. */
export interface MachineStatusPayload {
  connected: boolean;
  /** GRBL's own last known status report (Idle/Run/Home/Alarm/...), null while disconnected or
   * before the first status poll has resolved. */
  grbl: GrblStatus | null;
}
