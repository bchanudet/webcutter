export type SerialParity = 'none' | 'even' | 'odd';

export enum GcodeOrigin {
  BOTTOM_LEFT = 0,
  TOP_LEFT = 1,
  TOP_RIGHT = 2,
  BOTTOM_RIGHT = 4,
  CENTER = 5,
}

export interface Machine {
  id: number;
  bedWidthMm: number;
  bedHeightMm: number;
  serialPortPath: string;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: SerialParity;
  mirrorX: boolean;
  mirrorY: boolean;
  origin: GcodeOrigin;
  maxAccelerationXMmPerSec2: number;
  maxAccelerationYMmPerSec2: number;
  maxSpeedXMmPerMin: number;
  maxSpeedYMmPerMin: number;
  sMax: number;
}

export interface MachinePayload {
  bedWidthMm: number;
  bedHeightMm: number;
  serialPortPath: string;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: SerialParity;
  mirrorX: boolean;
  mirrorY: boolean;
  origin: GcodeOrigin;
  maxAccelerationXMmPerSec2: number;
  maxAccelerationYMmPerSec2: number;
  maxSpeedXMmPerMin: number;
  maxSpeedYMmPerMin: number;
  sMax: number;
}
