import { computeGcodeBoundingBox } from './gcode-bounding-box';

describe('computeGcodeBoundingBox', () => {
  it('returns null for a program that never leaves the origin', () => {
    expect(computeGcodeBoundingBox('$H\nG0 X0 Y0\nM5')).toBeNull();
  });

  it('computes the bounding box of every X/Y move', () => {
    const gcode = ['$H', 'G0 X10 Y10', 'M4 S50', 'G1 X50 Y10 F600', 'G1 X50 Y40 F600', 'M5'].join('\n');
    expect(computeGcodeBoundingBox(gcode)).toEqual({ minX: 10, minY: 10, maxX: 50, maxY: 40 });
  });

  it('ignores the origin even when it appears alongside real moves', () => {
    const gcode = ['$H', 'G0 X0 Y0', 'G1 X20 Y20 F600', 'G0 X0 Y0'].join('\n');
    expect(computeGcodeBoundingBox(gcode)).toEqual({ minX: 20, minY: 20, maxX: 20, maxY: 20 });
  });

  it('carries the last known value of an axis across lines that only specify the other one', () => {
    const gcode = ['G0 X5 Y5', 'G1 X30 F600', 'G1 Y25 F600'].join('\n');
    expect(computeGcodeBoundingBox(gcode)).toEqual({ minX: 5, minY: 5, maxX: 30, maxY: 25 });
  });

  it('ignores full-line comments and strips trailing line comments', () => {
    const gcode = ['; header comment', '(also a comment)', 'G1 X15 Y15 F600 ; inline comment'].join('\n');
    expect(computeGcodeBoundingBox(gcode)).toEqual({ minX: 15, minY: 15, maxX: 15, maxY: 15 });
  });
});
