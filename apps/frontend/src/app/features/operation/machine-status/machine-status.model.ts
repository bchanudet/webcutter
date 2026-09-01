export type GrblMachineState =
  | 'Idle'
  | 'Run'
  | 'Hold'
  | 'Jog'
  | 'Alarm'
  | 'Door'
  | 'Check'
  | 'Home'
  | 'Sleep';

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
