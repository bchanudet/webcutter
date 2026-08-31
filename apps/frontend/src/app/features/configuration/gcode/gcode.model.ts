export type GcodeHook = 'start' | 'end';

export interface Gcode {
  id: number;
  name: string;
  hook: GcodeHook;
  order: number;
  code: string;
}

export interface GcodePayload {
  name: string;
  hook: GcodeHook;
  order: number;
  code: string;
}
