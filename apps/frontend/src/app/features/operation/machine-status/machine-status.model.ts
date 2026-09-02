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
}

/** Mirrors the backend's `MachineStatusPayload` (apps/backend/src/app/cutter/cutter-ws.types.ts) —
 * broadcast over the `/api/ws/cutter` WebSocket whenever the machine's connection or GRBL-reported
 * state changes. */
export interface MachineStatusPayload {
  connected: boolean;
  grbl: GrblStatus | null;
}

export type SerialMessageDirection = 'sent' | 'received';

/** Mirrors the backend's `SerialMessagePayload` — broadcast over `/api/ws/cutter` for every byte
 * sequence written to or read from the cutter's serial port. */
export interface SerialMessagePayload {
  direction: SerialMessageDirection;
  timestampMs: number;
  dataBase64: string;
}
