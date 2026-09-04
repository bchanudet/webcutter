import { isSendableCodeLine, parseCodeLines, tokenizeGcodeLine } from './gcode-code.model';

describe('tokenizeGcodeLine', () => {
  it('renders a full-line comment as a single comment token', () => {
    expect(tokenizeGcodeLine('; Path abc123 — profile "Cut"')).toEqual([
      { text: '; Path abc123 — profile "Cut"', cls: 'comment' },
    ]);
  });

  it('colors G0 and G1 as whole words, blue and red respectively', () => {
    expect(tokenizeGcodeLine('G0 X10 Y10')).toEqual([
      { text: 'G0', cls: 'g0' },
      { text: ' ', cls: null },
      { text: 'X', cls: 'param' },
      { text: '10', cls: 'number' },
      { text: ' ', cls: null },
      { text: 'Y', cls: 'param' },
      { text: '10', cls: 'number' },
    ]);
    expect(tokenizeGcodeLine('G1 X50 Y10 F600')).toEqual([
      { text: 'G1', cls: 'g1' },
      { text: ' ', cls: null },
      { text: 'X', cls: 'param' },
      { text: '50', cls: 'number' },
      { text: ' ', cls: null },
      { text: 'Y', cls: 'param' },
      { text: '10', cls: 'number' },
      { text: ' ', cls: null },
      { text: 'F', cls: 'param' },
      { text: '600', cls: 'number' },
    ]);
  });

  it('treats G00/G01 the same as G0/G1 (numeric value, not exact text)', () => {
    expect(tokenizeGcodeLine('G00 G17')).toEqual([
      { text: 'G00', cls: 'g0' },
      { text: ' ', cls: null },
      { text: 'G', cls: null },
      { text: '17', cls: 'number' },
    ]);
  });

  it('colors any M-code word green as a whole word', () => {
    expect(tokenizeGcodeLine('M4 S200')).toEqual([
      { text: 'M4', cls: 'mcode' },
      { text: ' ', cls: null },
      { text: 'S', cls: 'param' },
      { text: '200', cls: 'number' },
    ]);
    expect(tokenizeGcodeLine('M30')).toEqual([{ text: 'M30', cls: 'mcode' }]);
  });

  it('splits words with no separator between them (e.g. LightBurn-exported files)', () => {
    expect(tokenizeGcodeLine('G1 Y-14.22S200F6000')).toEqual([
      { text: 'G1', cls: 'g1' },
      { text: ' ', cls: null },
      { text: 'Y', cls: 'param' },
      { text: '-14.22', cls: 'number' },
      { text: 'S', cls: 'param' },
      { text: '200', cls: 'number' },
      { text: 'F', cls: 'param' },
      { text: '6000', cls: 'number' },
    ]);
  });

  it('splits off a trailing comment instead of tokenizing it as code (e.g. a hex id with letter+digit runs)', () => {
    expect(tokenizeGcodeLine('G1 X10 ; note abc123')).toEqual([
      { text: 'G1', cls: 'g1' },
      { text: ' ', cls: null },
      { text: 'X', cls: 'param' },
      { text: '10', cls: 'number' },
      { text: ' ', cls: null },
      { text: '; note abc123', cls: 'comment' },
    ]);
  });

  it('leaves a line with no letter+digit word untouched, as a single plain token', () => {
    expect(tokenizeGcodeLine('$H')).toEqual([{ text: '$H', cls: null }]);
    expect(tokenizeGcodeLine('')).toEqual([]);
  });
});

describe('isSendableCodeLine', () => {
  it('is true for a real command line', () => {
    expect(isSendableCodeLine('G1 X10 Y10 F600')).toBe(true);
  });

  it('is false for a blank line, a full-line ; comment, and a full-line ( comment', () => {
    expect(isSendableCodeLine('')).toBe(false);
    expect(isSendableCodeLine('   ')).toBe(false);
    expect(isSendableCodeLine('; comment')).toBe(false);
    expect(isSendableCodeLine('(comment)')).toBe(false);
  });
});

describe('parseCodeLines', () => {
  it('numbers only the sendable lines, in order, leaving blanks/comments as null', () => {
    const content = ['; header', 'G0 X0 Y0', '', 'G1 X10 Y10 F600', 'M30'].join('\n');

    expect(parseCodeLines(content).map((line) => line.sendableIndex)).toEqual([null, 0, null, 1, 2]);
  });

  it('produces one CodeLine per raw line, including blank ones', () => {
    const content = 'G0 X0 Y0\n\nM30';
    expect(parseCodeLines(content)).toHaveLength(3);
    expect(parseCodeLines(content)[1]).toEqual({ raw: '', tokens: [], sendableIndex: null });
  });
});
