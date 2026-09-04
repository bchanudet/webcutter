import { GrblMachineState } from '@webcutter/shared';

export type StatusSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary';

/** Human-friendly label for each GRBL state — shared by every UI surface that shows the machine's
 * status (`MachineStatusCard` on the Operation page, `MachineStatusFlashcard` in the menubar). */
export const GRBL_STATE_LABELS: Record<GrblMachineState, string> = {
  Idle: 'Idle',
  Run: 'Processing',
  Hold: 'Hold',
  Jog: 'Jogging',
  Alarm: 'Alarm',
  Door: 'Door open',
  Check: 'Check mode',
  Home: 'Homing',
  Sleep: 'Sleep',
  Framing: 'Framing',
};

/** Tag/badge severity for each GRBL state — see `GRBL_STATE_LABELS`. */
export const GRBL_STATE_SEVERITIES: Record<GrblMachineState, StatusSeverity> = {
  Idle: 'success',
  Run: 'info',
  Hold: 'warn',
  Jog: 'info',
  Alarm: 'danger',
  Door: 'danger',
  Check: 'secondary',
  Home: 'info',
  Sleep: 'secondary',
  Framing: 'warn',
};

/** GRBL 1.1's own `ALARM:N` codes — see https://github.com/gnea/grbl/wiki/Grbl-v1.1-Interface#alarm-messages */
const GRBL_ALARM_REASONS: Record<number, string> = {
  1: 'Hard limit triggered',
  2: 'G-code move target exceeds machine travel',
  3: 'Reset while in motion — position may be lost',
  4: 'Probe failed (unexpected initial state)',
  5: 'Probe failed (no contact with workpiece)',
  6: 'Homing cycle reset before completing',
  7: 'Safety door opened during homing',
  8: 'Homing failed to clear the limit switch',
  9: 'Homing could not find the limit switch',
  10: 'Homing could not find the second limit switch',
};

/** A human-readable reason for a GRBL alarm code, or `null` if there's no code to describe. */
export function describeAlarm(alarmCode: number | null | undefined): string | null {
  if (alarmCode == null) {
    return null;
  }
  return GRBL_ALARM_REASONS[alarmCode] ?? `Alarm code ${alarmCode}`;
}
