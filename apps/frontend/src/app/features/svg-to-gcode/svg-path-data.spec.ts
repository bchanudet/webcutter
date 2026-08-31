import { parsePathCommands } from './svg-path-data';

describe('parsePathCommands', () => {
  it('parses absolute moveto/lineto', () => {
    expect(parsePathCommands('M0,0 L10,0 L10,10')).toEqual([
      { code: 'M', args: [0, 0] },
      { code: 'L', args: [10, 0] },
      { code: 'L', args: [10, 10] },
    ]);
  });

  it('preserves lowercase (relative) command letters', () => {
    expect(parsePathCommands('m0,0 l10,0')).toEqual([
      { code: 'm', args: [0, 0] },
      { code: 'l', args: [10, 0] },
    ]);
  });

  it('treats extra coordinate pairs after M as implicit linetos, keeping M/L case', () => {
    expect(parsePathCommands('M0,0 10,10 20,20')).toEqual([
      { code: 'M', args: [0, 0] },
      { code: 'L', args: [10, 10] },
      { code: 'L', args: [20, 20] },
    ]);
    expect(parsePathCommands('m0,0 10,10')).toEqual([
      { code: 'm', args: [0, 0] },
      { code: 'l', args: [10, 10] },
    ]);
  });

  it('splits repeated argument groups into one command each', () => {
    expect(parsePathCommands('L1,2 3,4 5,6')).toEqual([
      { code: 'L', args: [1, 2] },
      { code: 'L', args: [3, 4] },
      { code: 'L', args: [5, 6] },
    ]);
  });

  it('parses commands with no separators between them', () => {
    expect(parsePathCommands('M0,0L10,0L10,10Z')).toEqual([
      { code: 'M', args: [0, 0] },
      { code: 'L', args: [10, 0] },
      { code: 'L', args: [10, 10] },
      { code: 'Z', args: [] },
    ]);
  });

  it('parses horizontal and vertical linetos', () => {
    expect(parsePathCommands('H10 V20')).toEqual([
      { code: 'H', args: [10] },
      { code: 'V', args: [20] },
    ]);
  });

  it('parses a single cubic curve and repeated cubic groups', () => {
    expect(parsePathCommands('C1,2 3,4 5,6')).toEqual([{ code: 'C', args: [1, 2, 3, 4, 5, 6] }]);
    expect(parsePathCommands('C1,2 3,4 5,6 7,8 9,10 11,12')).toEqual([
      { code: 'C', args: [1, 2, 3, 4, 5, 6] },
      { code: 'C', args: [7, 8, 9, 10, 11, 12] },
    ]);
  });

  it('parses smooth cubic (S), quadratic (Q) and smooth quadratic (T)', () => {
    expect(parsePathCommands('S1,2 3,4')).toEqual([{ code: 'S', args: [1, 2, 3, 4] }]);
    expect(parsePathCommands('Q1,2 3,4')).toEqual([{ code: 'Q', args: [1, 2, 3, 4] }]);
    expect(parsePathCommands('T3,4')).toEqual([{ code: 'T', args: [3, 4] }]);
  });

  it('parses an arc with normally separated arguments', () => {
    expect(parsePathCommands('A5,5 0 1,1 10,10')).toEqual([
      { code: 'A', args: [5, 5, 0, 1, 1, 10, 10] },
    ]);
  });

  it('parses an arc whose flag digits are packed with no separator', () => {
    // "1116,16" -> large-arc-flag=1, sweep-flag=1, x=16, y=16
    expect(parsePathCommands('A5,5 0 1116,16')).toEqual([
      { code: 'A', args: [5, 5, 0, 1, 1, 16, 16] },
    ]);
  });

  it('drops a trailing group of numbers that does not fill a full argument set', () => {
    expect(parsePathCommands('L1,2 3')).toEqual([{ code: 'L', args: [1, 2] }]);
  });

  it('parses negative numbers and scientific notation', () => {
    expect(parsePathCommands('L-1.5,2e-3')).toEqual([{ code: 'L', args: [-1.5, 0.002] }]);
  });
});
