export interface PathCommand {
  /** Single command letter, original case preserved (uppercase = absolute, lowercase = relative). */
  code: string;
  args: number[];
}

const NUMBER_PATTERN = '[-+]?(?:\\d+\\.\\d+|\\.\\d+|\\d+)(?:[eE][-+]?\\d+)?';
const NUMBER_RE = new RegExp(NUMBER_PATTERN, 'g');
const COMMAND_RE = /([MmZzLlHhVvCcSsQqTtAa])([^MmZzLlHhVvCcSsQqTtAa]*)/g;
const ARC_ARGS_RE = new RegExp(
  `(${NUMBER_PATTERN})[,\\s]*(${NUMBER_PATTERN})[,\\s]*(${NUMBER_PATTERN})[,\\s]*([01])[,\\s]*([01])[,\\s]*(${NUMBER_PATTERN})[,\\s]*(${NUMBER_PATTERN})`,
  'g',
);

const ARG_COUNTS: Record<string, number> = {
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
};

/**
 * Tokenizes an SVG path `d` attribute into a flat list of single-coordinate-set commands
 * (repeated argument groups, e.g. "L10,0 20,5", are split into one command per group).
 * `A`/`a` arguments are parsed with a dedicated pattern because their flag arguments
 * (large-arc-flag, sweep-flag) are single 0/1 digits that commonly appear with no separator
 * from the number that follows (e.g. "A5,5 0 1116,16").
 */
export function parsePathCommands(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  let match: RegExpExecArray | null;
  COMMAND_RE.lastIndex = 0;

  while ((match = COMMAND_RE.exec(d))) {
    const code = match[1];
    const rest = match[2];
    const upper = code.toUpperCase();

    if (upper === 'Z') {
      commands.push({ code, args: [] });
      continue;
    }

    if (upper === 'A') {
      let argMatch: RegExpExecArray | null;
      ARC_ARGS_RE.lastIndex = 0;
      while ((argMatch = ARC_ARGS_RE.exec(rest))) {
        commands.push({ code, args: argMatch.slice(1, 8).map(Number) });
      }
      continue;
    }

    const numbers = (rest.match(NUMBER_RE) ?? []).map(Number);

    if (upper === 'M') {
      // A moveto followed by extra coordinate pairs implies lineto for the rest (spec behaviour).
      for (let i = 0; i + 1 < numbers.length; i += 2) {
        const isFirst = i === 0;
        commands.push({
          code: isFirst ? code : code === 'M' ? 'L' : 'l',
          args: [numbers[i], numbers[i + 1]],
        });
      }
      continue;
    }

    const argCount = ARG_COUNTS[upper];
    for (let i = 0; i + argCount <= numbers.length; i += argCount) {
      commands.push({ code, args: numbers.slice(i, i + argCount) });
    }
  }

  return commands;
}
