export type ProfileMode = 'LINE' | 'FILL';

export interface Profile {
  id: number;
  materialId: number;
  name: string;
  color: string;
  mode: ProfileMode;
  powerPercent: number;
  speedMmPerSec: number;
  passes: number;
  lineSpacingMm: number | null;
}

export interface Material {
  id: number;
  name: string;
  thicknessMm: number;
  profiles: Profile[];
}

export interface MaterialPayload {
  name: string;
  thicknessMm: number;
}

export interface ProfilePayload {
  name: string;
  color: string;
  mode: ProfileMode;
  powerPercent: number;
  speedMmPerSec: number;
  passes: number;
  lineSpacingMm?: number | null;
}
