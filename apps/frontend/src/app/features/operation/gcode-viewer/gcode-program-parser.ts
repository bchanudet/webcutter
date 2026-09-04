import { Machine } from '../../configuration/machine/machine.model';

export type GcodeSegmentType = 'G0' | 'G1';

export interface GcodeSegment {
  type: GcodeSegmentType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Feed rate (`F`) in effect for this segment — modal, so it's whatever the last `F` word was,
   * on this line or an earlier one. `null` if the program never sets one before this segment. */
  feedRate: number | null;
  /** Laser power (`S`) in effect for this segment — modal, same rule as `feedRate`. Set by the
   * `M4 S<power>` this app's own generator emits before each cut, but read from a plain `S` word
   * on any line, same as GRBL itself does. */
  power: number | null;
}

/** Parses a G-code program into the ordered list of G0 (rapid move) / G1 (linear cut) segments it
 * draws — the only two motion commands this app's own generator ever emits (see
 * `WorkspaceGcodeGeneratorService`) and the only two the Operation page's G-code viewer draws.
 *
 * Tokenizes each line into words (rather than substring-matching, e.g. `/G0/`) so a word like
 * `G90`/`G28` — sharing a leading digit with `G0` but modally unrelated to it — is never mistaken
 * for a motion command. Tracks X/Y across lines that only specify one axis, and which motion mode
 * is active, both modally (carried over from the last line that set them until changed), so a file
 * that spreads a single logical move across several lines still renders correctly. All coordinates
 * are read as absolute (G90) — this app's own generator never emits G91, so relative positioning
 * isn't handled.
 *
 * G2/G3 (arcs) move the tracked cursor to their endpoint (so the next G0/G1 doesn't draw a bogus
 * long segment back to a stale position) but themselves produce no segment — this app never
 * generates them (see the "no curves" rule throughout the SVG import pipeline), and correctly
 * drawing one would need to interpret I/J/R parameters this parser doesn't read. */
export function parseGcodeProgram(content: string): GcodeSegment[] {
  const segments: GcodeSegment[] = [];
  let x = 0;
  let y = 0;
  let motion: GcodeSegmentType | null = null;
  let feed: number | null = null;
  let power: number | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.split(';')[0].trim();
    if (!line || line.startsWith('(')) {
      continue;
    }

    let targetX: number | null = null;
    let targetY: number | null = null;

    for (const word of line.split(/\s+/)) {
      const letter = word[0]?.toUpperCase();
      const value = Number(word.slice(1));
      if (letter === 'G' && (value === 0 || value === 1)) {
        motion = value === 0 ? 'G0' : 'G1';
      } else if (letter === 'G' && (value === 2 || value === 3)) {
        motion = null;
      } else if (letter === 'X') {
        targetX = value;
      } else if (letter === 'Y') {
        targetY = value;
      } else if (letter === 'F') {
        feed = value;
      } else if (letter === 'S') {
        power = value;
      }
    }

    if (targetX === null && targetY === null) {
      continue;
    }

    const nextX = targetX ?? x;
    const nextY = targetY ?? y;

    if (motion) {
      segments.push({ type: motion, x1: x, y1: y, x2: nextX, y2: nextY, feedRate: feed, power });
    }

    x = nextX;
    y = nextY;
  }

  return segments;
}

/** Converts a point already in G-code's machine space (Y-up, shifted by `Machine.offsetXMm`/
 * `offsetYMm` from the bed's own corner) into bed-mm space (top-left origin, Y down) — the
 * coordinate system `BedGridCanvas` draws its grid in. The exact inverse of
 * `WorkspaceGcodeGeneratorService.toMachinePoint()` on the backend. */
export function gcodeToBedPoint(
  point: { x: number; y: number },
  machine: Machine | null,
  bedHeightMm: number,
): { x: number; y: number } {
  return {
    x: point.x - (machine?.offsetXMm ?? 0),
    y: bedHeightMm - point.y + (machine?.offsetYMm ?? 0),
  };
}
