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
