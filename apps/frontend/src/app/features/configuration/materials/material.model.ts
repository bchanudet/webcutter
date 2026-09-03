export type ProfileMode = 'LINE' | 'FILL';

export interface Profile {
  id: string;
  materialId: string;
  name: string;
  color: string;
  mode: ProfileMode;
  powerPercent: number;
  speedMmPerMin: number;
  passes: number;
  lineSpacingMm: number | null;
}

export interface Material {
  id: string;
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
  speedMmPerMin: number;
  passes: number;
  lineSpacingMm?: number | null;
}
