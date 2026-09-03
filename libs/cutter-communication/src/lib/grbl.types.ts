export interface GrblConnectionOptions {
  path: string;
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: 'none' | 'even' | 'odd';
}

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
  // Synthetic state, never reported by GRBL itself — see `CutterGateway.applyFramingOverride`.
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
   * while `state` is `'Alarm'`, and only populated by `CutterGateway`, never by
   * `parseGrblStatus` (the `?` status report never carries it). `null`/absent means the reason
   * isn't known (e.g. the machine was already alarmed before this process connected). */
  alarmCode?: number | null;
}

export interface CutterPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
}
