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
  maxSpeedXMmPerSec?: number;
  maxSpeedYMmPerSec?: number;
  sMax?: number;
}

export function parseLbdevProfile(text: string): LbdevImportResult {
  const parsed = JSON.parse(text) as LbdevFile;
  const device = parsed.DeviceList?.[0];
  if (!device) {
    throw new Error('Le fichier lbdev ne contient aucun appareil.');
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
  if (settings.Sim_MaxSpeedX != null) result.maxSpeedXMmPerSec = settings.Sim_MaxSpeedX;
  if (settings.Sim_MaxSpeedY != null) result.maxSpeedYMmPerSec = settings.Sim_MaxSpeedY;
  if (settings.S_Scale != null) result.sMax = settings.S_Scale;

  return result;
}
