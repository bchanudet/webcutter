export type GrblMachineState =
  | 'Idle'
  | 'Run'
  | 'Hold'
  | 'Jog'
  | 'Alarm'
  | 'Door'
  | 'Check'
  | 'Home'
  | 'Sleep'
  // Synthetic state, never reported by GRBL itself — see the backend's `CutterGateway.applyFramingOverride`.
  | 'Framing';

export interface GrblPosition {
  x: number;
  y: number;
  z: number;
}

export type StatusSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary';

/** Human-friendly label for each GRBL state — shared by every UI surface that shows the machine's
 * status (`MachineStatusCard` on the Operation page, `MachineStatusFlashcard` in the menubar). */
export const GRBL_STATE_LABELS: Record<GrblMachineState, string> = {
  Idle: 'Idle',
  Run: 'Processing',
  Hold: 'Hold',
  Jog: 'Jogging',
  Alarm: 'Alarm',
  Door: 'Door open',
  Check: 'Check mode',
  Home: 'Homing',
  Sleep: 'Sleep',
  Framing: 'Framing',
};

/** Tag/badge severity for each GRBL state — see `GRBL_STATE_LABELS`. */
export const GRBL_STATE_SEVERITIES: Record<GrblMachineState, StatusSeverity> = {
  Idle: 'success',
  Run: 'info',
  Hold: 'warn',
  Jog: 'info',
  Alarm: 'danger',
  Door: 'danger',
  Check: 'secondary',
  Home: 'info',
  Sleep: 'secondary',
  Framing: 'warn',
};

export interface GrblStatus {
  state: GrblMachineState;
  machinePosition?: GrblPosition;
  workPosition?: GrblPosition;
  raw: string;
  /** Numeric code of the last `ALARM:N` line received (e.g. `1` for a hard limit) — only ever set
   * while `state` is `'Alarm'`; `null`/absent means the reason isn't known. */
  alarmCode?: number | null;
}

/** Mirrors the backend's `MachineStatusPayload` (apps/backend/src/app/cutter/cutter-ws.types.ts) —
 * broadcast over the `/api/ws/cutter` WebSocket whenever the machine's connection or GRBL-reported
 * state changes. */
export interface MachineStatusPayload {
  connected: boolean;
  grbl: GrblStatus | null;
  /** Message from the most recent failed `connect` attempt, or from a serial error that occurred
   * while connected — see the backend's `MachineStatusPayload.connectionError`. */
  connectionError: string | null;
}

export type SerialMessageDirection = 'sent' | 'received';

/** Mirrors the backend's `SerialMessagePayload` — broadcast over `/api/ws/cutter` for every byte
 * sequence written to or read from the cutter's serial port. */
export interface SerialMessagePayload {
  direction: SerialMessageDirection;
  timestampMs: number;
  dataBase64: string;
}

/** GRBL 1.1's own `ALARM:N` codes — see https://github.com/gnea/grbl/wiki/Grbl-v1.1-Interface#alarm-messages */
const GRBL_ALARM_REASONS: Record<number, string> = {
  1: 'Hard limit triggered',
  2: 'G-code move target exceeds machine travel',
  3: 'Reset while in motion — position may be lost',
  4: 'Probe failed (unexpected initial state)',
  5: 'Probe failed (no contact with workpiece)',
  6: 'Homing cycle reset before completing',
  7: 'Safety door opened during homing',
  8: 'Homing failed to clear the limit switch',
  9: 'Homing could not find the limit switch',
  10: 'Homing could not find the second limit switch',
};

/** A human-readable reason for a GRBL alarm code, or `null` if there's no code to describe. */
export function describeAlarm(alarmCode: number | null | undefined): string | null {
  if (alarmCode == null) {
    return null;
  }
  return GRBL_ALARM_REASONS[alarmCode] ?? `Alarm code ${alarmCode}`;
}

/** Mirrors the backend's `CheckOutcome` (apps/backend/src/app/cutter/check.service.ts). */
export interface CheckOutcome {
  ok: boolean;
  message: string;
  alarmCode: number | null;
}

/** Mirrors the backend's `CheckStatusPayload` — broadcast over `/api/ws/cutter` whenever a `$C`
 * check run starts or finishes. */
export interface CheckStatusPayload {
  running: boolean;
  result: CheckOutcome | null;
}

/** Mirrors the backend's `JobStatusPayload` — broadcast over `/api/ws/cutter` whenever a cutting
 * job starts, advances, or finishes. Surfaced app-wide via the menubar flashcard (see
 * `MachineStatusFlashcard`), not just the Operation page. */
export interface JobStatusPayload {
  running: boolean;
  /** Whether the job is currently on feed hold — only meaningful while `running` is true. */
  paused: boolean;
  fileName: string | null;
  currentLine: number;
  totalLines: number;
  error: string | null;
}
