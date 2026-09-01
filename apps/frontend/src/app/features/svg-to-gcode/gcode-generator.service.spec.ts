import { GcodeGeneratorService, GcodeParams } from './gcode-generator.service';
import { FlattenedShape } from './svg-flattener.service';

describe('GcodeGeneratorService', () => {
  let service: GcodeGeneratorService;

  const baseParams: GcodeParams = {
    targetWidthMm: 50,
    feedRateMmMin: 600,
    laserPower: 300,
    passes: 1,
  };

  const square: FlattenedShape = {
    id: 'doc-1:shape:0',
    explodable: false,
    subpaths: [
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        closed: false,
      },
    ],
    groupKey: 'doc-1',
  };

  beforeEach(() => {
    service = new GcodeGeneratorService();
  });

  it('throws when there are no shapes', () => {
    expect(() => service.generate([], 100, 100, baseParams)).toThrow(
      'No cuttable shape found in this SVG.',
    );
  });

  it('emits standard header and footer G-code', () => {
    const gcode = service.generate([square], 100, 50, baseParams);
    const lines = gcode.split('\n');

    expect(lines).toContain('G21 ; units in millimeters');
    expect(lines).toContain('G90 ; absolute positioning');
    expect(lines[lines.length - 1]).toBe('M30 ; end of program');
    expect(lines[lines.length - 2]).toBe('G0 X0 Y0 ; return to origin');
  });

  it('scales points to the target width and flips the Y axis', () => {
    // svgWidth 100 -> targetWidthMm 50 means scale = 0.5; svgHeight 50 flips Y.
    const gcode = service.generate([square], 100, 50, baseParams);

    expect(gcode).toContain('G0 X0.000 Y25.000');
    expect(gcode).toContain('G1 X5.000 Y25.000 F600');
    expect(gcode).toContain('G1 X5.000 Y20.000 F600');
  });

  it('turns the laser on with M4 and the configured power, then off with M5', () => {
    const gcode = service.generate([square], 100, 50, baseParams);
    const lines = gcode.split('\n');

    const travelIndex = lines.indexOf('G0 X0.000 Y25.000');
    expect(lines[travelIndex + 1]).toBe('M4 S300');
    expect(lines).toContain('M5');
  });

  it('repeats the whole program once per pass', () => {
    const gcode = service.generate([square], 100, 50, { ...baseParams, passes: 3 });

    expect(gcode.match(/; Pass \d\/3/g)).toHaveLength(3);
    expect(gcode.match(/M4 S300/g)).toHaveLength(3);
  });

  it('skips subpaths with fewer than two points', () => {
    const gcode = service.generate(
      [
        {
          id: 'doc-1:shape:1',
          explodable: false,
          subpaths: [{ points: [{ x: 0, y: 0 }], closed: false }],
          groupKey: 'doc-1',
        },
        square,
      ],
      100,
      50,
      baseParams,
    );

    expect(gcode.match(/M4 S300/g)).toHaveLength(1);
  });
});
