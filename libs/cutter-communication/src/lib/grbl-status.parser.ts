import { GrblMachineState, GrblPosition, GrblStatus } from './grbl.types';

const STATUS_REPORT_PATTERN = /^<([^|>]+)(?:\|([^>]*))?>$/;

function parsePosition(value: string): GrblPosition | undefined {
  const [x, y, z] = value.split(',').map(Number);
  if ([x, y, z].some((coordinate) => Number.isNaN(coordinate))) {
    return undefined;
  }
  return { x, y, z };
}

/**
 * Parses a GRBL 1.1 real-time status report, e.g. `<Idle|MPos:0.000,0.000,0.000|FS:0,0>`.
 */
export function parseGrblStatus(line: string): GrblStatus {
  const match = STATUS_REPORT_PATTERN.exec(line.trim());
  if (!match) {
    throw new Error(`Rapport d'état GRBL invalide : ${line}`);
  }

  const [, state, fields] = match;
  const status: GrblStatus = {
    state: state as GrblMachineState,
    raw: line,
  };

  for (const field of fields?.split('|') ?? []) {
    const separatorIndex = field.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = field.slice(0, separatorIndex);
    const value = field.slice(separatorIndex + 1);

    if (key === 'MPos') {
      status.machinePosition = parsePosition(value);
    } else if (key === 'WPos') {
      status.workPosition = parsePosition(value);
    }
  }

  return status;
}
