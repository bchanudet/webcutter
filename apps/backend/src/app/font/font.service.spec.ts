import { readFileSync } from 'fs';
import { join } from 'path';
import { FontService } from './font.service';

const FONT_DIR = join(__dirname, '../../assets/font');
const readGlyphD = (name: string): string => {
  const match = /d="([^"]*)"/.exec(readFileSync(join(FONT_DIR, `${name}.svg`), 'utf-8'));
  if (!match) {
    throw new Error(`No <path d> found in ${name}.svg — fixture assumption broken.`);
  }
  return match[1];
};

describe('FontService', () => {
  let service: FontService;

  beforeEach(() => {
    service = new FontService();
  });

  it('renders a known character as a single top-level <path>, sized to the default 10mm height', () => {
    const svg = service.renderText('A');
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="6.1mm" height="10mm" viewBox="0 0 6.1 10">');
    expect(svg).toContain('fill="currentColor"');
    expect(svg).toContain('transform="translate(0 0) scale(0.01)"');
    expect(svg).toContain(readGlyphD('65'));
  });

  it('scales to a custom height, in proportion', () => {
    const svg = service.renderText('A', 20);
    expect(svg).toContain('width="12.2mm" height="20mm" viewBox="0 0 12.2 20"');
    expect(svg).toContain('transform="translate(0 0) scale(0.02)"');
  });

  it("lays out multiple characters left to right, advancing by each glyph's own viewBox width, converted to mm", () => {
    const svg = service.renderText('AA');
    expect(svg).toContain('width="12.2mm" height="10mm" viewBox="0 0 12.2 10"');
    expect(svg).toContain('transform="translate(0 0) scale(0.01)"');
    expect(svg).toContain('transform="translate(6.1 0) scale(0.01)"');
  });

  it('falls back to undefined.svg for a codepoint with no dedicated glyph file', () => {
    const svg = service.renderText('\u{1F600}');
    expect(svg).toContain(readGlyphD('undefined'));
  });

  it('wraps a glyph with no <path> (e.g. a non-printable placeholder) in a <g>', () => {
    const svg = service.renderText('\r');
    expect(svg).toContain('<g transform="translate(0 0) scale(0.01)">');
    expect(svg).not.toContain('<path');
  });

  it('treats a space as a blank glyph advancing the cursor, not the undefined.svg placeholder', () => {
    const svg = service.renderText('A A');
    expect(svg).not.toContain(readGlyphD('undefined'));
    // A (610 units) + space (300 units) = 910 units -> 9.1mm at the default 10mm height (scale 0.01).
    expect(svg).toContain('transform="translate(9.1 0) scale(0.01)"');
    expect(svg.match(/<path/g)).toHaveLength(2);
  });

  it('renders an empty string as an empty, zero-width svg', () => {
    expect(service.renderText('')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="0mm" height="10mm" viewBox="0 0 0 10"></svg>',
    );
  });
});
