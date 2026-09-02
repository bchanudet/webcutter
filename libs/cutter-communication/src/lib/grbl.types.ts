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
}

export interface CutterPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
}
