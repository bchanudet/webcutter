import { GcodeOrigin } from './machine.model';

interface LbdevSettings {
  BaudRate?: number;
  CommPort?: string;
  CutOrigin?: number;
  Sim_MaxAccelX?: number;
  Sim_MaxAccelY?: number;
  Sim_MaxSpeedX?: number;
  Sim_MaxSpeedY?: number;
  S_Scale?: number;
}

interface LbdevDevice {
  Width?: number;
  Height?: number;
  MirrorX?: boolean;
  MirrorY?: boolean;
  Settings?: LbdevSettings;
}

interface LbdevFile {
  DeviceList?: LbdevDevice[];
}

export interface LbdevImportResult {
  bedWidthMm?: number;
  bedHeightMm?: number;
  mirrorX?: boolean;
  mirrorY?: boolean;
  origin?: GcodeOrigin;
  serialPortPath?: string;
  baudRate?: number;
  maxAccelerationXMmPerSec2?: number;
  maxAccelerationYMmPerSec2?: number;
  maxSpeedXMmPerMin?: number;
  maxSpeedYMmPerMin?: number;
  sMax?: number;
}

export function parseLbdevProfile(text: string): LbdevImportResult {
  const parsed = JSON.parse(text) as LbdevFile;
  const device = parsed.DeviceList?.[0];
  if (!device) {
    throw new Error('The lbdev file contains no device.');
  }

  const settings = device.Settings ?? {};
  const result: LbdevImportResult = {};

  if (device.Width != null) result.bedWidthMm = device.Width;
  if (device.Height != null) result.bedHeightMm = device.Height;
  if (device.MirrorX != null) result.mirrorX = device.MirrorX;
  if (device.MirrorY != null) result.mirrorY = device.MirrorY;
  if (settings.CutOrigin != null) result.origin = settings.CutOrigin as GcodeOrigin;
  if (settings.CommPort != null) result.serialPortPath = settings.CommPort;
  if (settings.BaudRate != null) result.baudRate = settings.BaudRate;
  if (settings.Sim_MaxAccelX != null) result.maxAccelerationXMmPerSec2 = settings.Sim_MaxAccelX;
  if (settings.Sim_MaxAccelY != null) result.maxAccelerationYMmPerSec2 = settings.Sim_MaxAccelY;
  // LightBurn's own GRBL-sim speed settings are already expressed in mm/min, so — unlike the
  // accel fields above, which are a straight passthrough of the same unit on both sides — this
  // passthrough is now *also* unit-correct on both sides, whereas before this migration it wasn't
  // (see the app-wide mm/s -> mm/min conversion).
  if (settings.Sim_MaxSpeedX != null) result.maxSpeedXMmPerMin = settings.Sim_MaxSpeedX;
  if (settings.Sim_MaxSpeedY != null) result.maxSpeedYMmPerMin = settings.Sim_MaxSpeedY;
  if (settings.S_Scale != null) result.sMax = settings.S_Scale;

  return result;
}
