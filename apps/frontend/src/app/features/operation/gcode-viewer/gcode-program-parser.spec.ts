import { Machine } from '@webcutter/shared';
import { gcodeToBedPoint, parseGcodeProgram } from './gcode-program-parser';

describe('parseGcodeProgram', () => {
  it('parses G0 and G1 moves into segments, tracking position across lines', () => {
    const gcode = ['$H', 'G90', 'G0 X10 Y10', 'M4 S50', 'G1 X50 Y10 F600', 'G1 X50 Y40 F600', 'M5'].join('\n');

    expect(parseGcodeProgram(gcode)).toEqual([
      { type: 'G0', x1: 0, y1: 0, x2: 10, y2: 10, feedRate: null, power: null },
      { type: 'G1', x1: 10, y1: 10, x2: 50, y2: 10, feedRate: 600, power: 50 },
      { type: 'G1', x1: 50, y1: 10, x2: 50, y2: 40, feedRate: 600, power: 50 },
    ]);
  });

  it('does not mistake a modally unrelated G-word (e.g. G90) sharing a leading digit for a motion command', () => {
    // G90 (absolute distance mode) doesn't change the active motion mode — the G0 from the first
    // line is still active for the plain "X0 Y0" line, so it draws a segment too.
    const gcode = ['G0 X10 Y10', 'G90', 'X0 Y0', 'G1 X20 Y20 F600'].join('\n');

    expect(parseGcodeProgram(gcode)).toEqual([
      { type: 'G0', x1: 0, y1: 0, x2: 10, y2: 10, feedRate: null, power: null },
      { type: 'G0', x1: 10, y1: 10, x2: 0, y2: 0, feedRate: null, power: null },
      { type: 'G1', x1: 0, y1: 0, x2: 20, y2: 20, feedRate: 600, power: null },
    ]);
  });

  it('carries the motion mode across a line that only specifies one axis', () => {
    const gcode = ['G1 X5 Y5 F600', 'X30', 'Y25'].join('\n');

    expect(parseGcodeProgram(gcode)).toEqual([
      { type: 'G1', x1: 0, y1: 0, x2: 5, y2: 5, feedRate: 600, power: null },
      { type: 'G1', x1: 5, y1: 5, x2: 30, y2: 5, feedRate: 600, power: null },
      { type: 'G1', x1: 30, y1: 5, x2: 30, y2: 25, feedRate: 600, power: null },
    ]);
  });

  it('moves the cursor for an arc (G2/G3) without emitting a segment for it', () => {
    const gcode = ['G1 X10 Y0 F600', 'G2 X20 Y10 I0 J10', 'G1 X20 Y20 F600'].join('\n');

    expect(parseGcodeProgram(gcode)).toEqual([
      { type: 'G1', x1: 0, y1: 0, x2: 10, y2: 0, feedRate: 600, power: null },
      { type: 'G1', x1: 20, y1: 10, x2: 20, y2: 20, feedRate: 600, power: null },
    ]);
  });

  it('ignores full-line and trailing comments', () => {
    const gcode = ['; header', '(also a comment)', 'G1 X15 Y15 F600 ; inline comment'].join('\n');

    expect(parseGcodeProgram(gcode)).toEqual([
      { type: 'G1', x1: 0, y1: 0, x2: 15, y2: 15, feedRate: 600, power: null },
    ]);
  });

  it('returns an empty array for a program with no motion', () => {
    expect(parseGcodeProgram('$H\nM3 S0\nM5')).toEqual([]);
  });

  it('parses words with no separator between them (e.g. LightBurn-exported files)', () => {
    // Real export, verbatim: no space between the X/Y values, or between Y/S/F on the next line.
    const gcode = ['G0 X-19.832Y-13.05', 'G1 Y-14.22S200F6000'].join('\n');

    expect(parseGcodeProgram(gcode)).toEqual([
      { type: 'G0', x1: 0, y1: 0, x2: -19.832, y2: -13.05, feedRate: null, power: null },
      { type: 'G1', x1: -19.832, y1: -13.05, x2: -19.832, y2: -14.22, feedRate: 6000, power: 200 },
    ]);
  });

  it('treats X/Y as relative offsets while G91 is active, and resumes absolute after G90', () => {
    const gcode = ['G91', 'G1 X10 Y5 F600', 'X10', 'G90', 'G1 X0 Y0'].join('\n');

    expect(parseGcodeProgram(gcode)).toEqual([
      { type: 'G1', x1: 0, y1: 0, x2: 10, y2: 5, feedRate: 600, power: null },
      { type: 'G1', x1: 10, y1: 5, x2: 20, y2: 5, feedRate: 600, power: null },
      { type: 'G1', x1: 20, y1: 5, x2: 0, y2: 0, feedRate: 600, power: null },
    ]);
  });

  it('tracks feed rate and power modally, independently of each other and of X/Y', () => {
    const gcode = [
      'M4 S100', // power set, no motion yet
      'G1 X10 Y0 F500', // feedRate=500, power=100
      'S200', // power changes mid-cut, on its own line
      'G1 X20 Y0', // feedRate still 500 (modal), power now 200
      'F800',
      'G1 X30 Y0', // feedRate now 800, power still 200
    ].join('\n');

    expect(parseGcodeProgram(gcode)).toEqual([
      { type: 'G1', x1: 0, y1: 0, x2: 10, y2: 0, feedRate: 500, power: 100 },
      { type: 'G1', x1: 10, y1: 0, x2: 20, y2: 0, feedRate: 500, power: 200 },
      { type: 'G1', x1: 20, y1: 0, x2: 30, y2: 0, feedRate: 800, power: 200 },
    ]);
  });
});

describe('gcodeToBedPoint', () => {
  it('flips Y and undoes the machine offset, with no machine falling back to a zero offset', () => {
    expect(gcodeToBedPoint({ x: 10, y: 20 }, null, 100)).toEqual({ x: 10, y: 80 });
  });

  it('inverts WorkspaceGcodeGeneratorService.toMachinePoint() exactly', () => {
    const machine = { offsetXMm: -20, offsetYMm: 5 } as Machine;
    const bedHeight = 110;
    // toMachinePoint({x: 30, y: 40}, {height: 110}, machine) = {x: 30 + -20, y: 110 - 40 + 5} = {x: 10, y: 75}
    expect(gcodeToBedPoint({ x: 10, y: 75 }, machine, bedHeight)).toEqual({ x: 30, y: 40 });
  });
});
