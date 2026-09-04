import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Material } from '../configuration/materials/material.model';
import { FontApiService } from './font-api.service';
import { GenerateTestPatternInput, TestPatternGeneratorService } from './test-pattern-generator.service';

const MATERIAL: Material = { id: 'material-1', name: 'Plywood', thicknessMm: 3, profiles: [] };

function baseInput(overrides: Partial<GenerateTestPatternInput> = {}): GenerateTestPatternInput {
  return {
    mode: 'LINE',
    shape: 'square',
    material: MATERIAL,
    powerMinPercent: 10,
    powerMaxPercent: 90,
    speedMinMmPerMin: 5,
    speedMaxMmPerMin: 50,
    steps: 3,
    includeMaterialLabel: false,
    includeLegends: false,
    surfaceWidthMm: 200,
    surfaceHeightMm: 150,
    ...overrides,
  };
}

/** A minimal, valid FontService-shaped response — one <path> per character isn't needed since
 * these tests only care about the workspace SVG's own structure, not the legend glyphs. */
function fakeTextSvg(widthMm: number, heightMm: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" ` +
    `viewBox="0 0 ${widthMm} ${heightMm}">` +
    `<path d="M0 0 L1 1" fill-rule="evenodd" transform="translate(0 0) scale(0.01)" fill="currentColor" />` +
    '</svg>'
  );
}

describe('TestPatternGeneratorService', () => {
  let service: TestPatternGeneratorService;
  let textToSvg: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    textToSvg = vi.fn().mockReturnValue(of({ svg: fakeTextSvg(10, 4) }));
    TestBed.configureTestingModule({
      providers: [TestPatternGeneratorService, { provide: FontApiService, useValue: { textToSvg } }],
    });
    service = TestBed.inject(TestPatternGeneratorService);
  });

  function generate(input: GenerateTestPatternInput): string {
    let result: string | undefined;
    service.generate(input).subscribe((svg) => (result = svg));
    if (result === undefined) {
      throw new Error('generate() did not emit synchronously — a test double did not resolve.');
    }
    return result;
  }

  it('sizes the output to exactly the given cutting surface, never larger', () => {
    const svg = generate(baseInput({ surfaceWidthMm: 180, surfaceHeightMm: 120 }));
    expect(svg).toContain('width="180mm" height="120mm" viewBox="0 0 180 120"');
  });

  it('creates one temporary profile per grid cell (steps x steps)', () => {
    const svg = generate(baseInput({ steps: 4 }));
    expect(svg.match(/<profile /g)).toHaveLength(16);
    expect(svg.match(/<path id="cell-/g)).toHaveLength(16);
  });

  it('interpolates power increasing and speed decreasing away from the origin', () => {
    const svg = generate(
      baseInput({ steps: 3, powerMinPercent: 0, powerMaxPercent: 100, speedMinMmPerMin: 10, speedMaxMmPerMin: 100 }),
    );
    // cell-<row>-<col>: column 0 (closest to the origin) must carry the min power, the last
    // column the max — and symmetrically, row 0 must carry the max speed, the last row the min.
    const profileIdFor = (cellId: string) => new RegExp(`<path id="${cellId}"[^>]*profile="([^"]+)"`).exec(svg)?.[1];
    const profileValues = (id: string | undefined) => {
      const match = id ? new RegExp(`<profile id="${id}"[^>]*/>`).exec(svg)?.[0] : undefined;
      return {
        power: match ? Number(/powerPercent="([^"]+)"/.exec(match)?.[1]) : NaN,
        speed: match ? Number(/speedMmPerMin="([^"]+)"/.exec(match)?.[1]) : NaN,
      };
    };

    const origin = profileValues(profileIdFor('cell-0-0'));
    const farthest = profileValues(profileIdFor('cell-2-2'));

    expect(origin.power).toBe(0);
    expect(origin.speed).toBe(100);
    expect(farthest.power).toBe(100);
    expect(farthest.speed).toBe(10);
  });

  it('uses the LINE mode as a stroke-only shape, and FILL as a filled one', () => {
    const line = generate(baseInput({ mode: 'LINE' }));
    expect(line).toContain('fill="none" stroke="#FF7300"');

    const fill = generate(baseInput({ mode: 'FILL' }));
    expect(fill).toContain('fill="#FF7300" stroke="transparent"');
  });

  it('renders the legend/material-label profile in green, visible in dark theme too', () => {
    const svg = generate(baseInput({ includeLegends: true, includeMaterialLabel: true }));
    expect(svg).toContain('color="#22C55E"');
    expect(svg).not.toContain('#333333');
  });

  it('only spells out "%" on the column axis\'s last tick, and requests "mm/min" as its own standalone label', () => {
    // baseInput: power 10 -> 90 and speed 5 -> 50 over 3 steps -> columns 10/50/90(%), rows
    // (speed decreasing) 50/27.5/5 — always bare, "mm/min" requested separately exactly once.
    generate(baseInput({ steps: 3, includeLegends: true }));
    const texts = textToSvg.mock.calls.map((call) => call[0] as string);
    expect(texts).toEqual(expect.arrayContaining(['10', '50', '90%', '27.5', '5', 'mm/min']));
    expect(texts).not.toContain('10%');
    expect(texts).not.toContain('50 mm/min');
    expect(texts).not.toContain('5 mm/min');
  });

  it('places the "mm/min" label in the grid\'s top-left corner (x = y = the legend padding)', () => {
    const svg = generate(baseInput({ steps: 3, includeLegends: true }));
    // The unit label is pushed before every column/row legend, so it's the first legend/label-
    // colored glyph path in the output; the fake glyph's own translate/scale is (0, 1), so its
    // resulting matrix's tx/ty are exactly the x/y passed to `embedText` — the 2mm padding used
    // for every top-left-anchored legend text, confirming it sits at the very top-left corner.
    const [firstMatrix] = [...svg.matchAll(/<path d="M0 0 L1 1"[^>]*transform="matrix\(([^)]+)\)"/g)];
    const [, , , , tx, ty] = firstMatrix[1].trim().split(/\s+/).map(Number);
    expect(tx).toBe(2);
    expect(ty).toBe(2);
  });

  it('gives the legend/material-label profile a fixed 50%/6000 mm/min, independent of the tested range', () => {
    const svg = generate(baseInput({ includeLegends: true, speedMinMmPerMin: 1, speedMaxMmPerMin: 999 }));
    expect(svg).toContain('name="Test pattern legend" color="#22C55E" type="FILL" powerPercent="50" speedMmPerMin="6000"');
  });

  it('does not call the font backend when neither legends nor the material label are requested', () => {
    generate(baseInput({ includeLegends: false, includeMaterialLabel: false }));
    expect(textToSvg).not.toHaveBeenCalled();
  });

  it('requests one legend text per column, per row, plus the unit label and the material label when all are enabled', () => {
    generate(baseInput({ steps: 3, includeLegends: true, includeMaterialLabel: true }));
    // 3 columns + 3 rows + 1 "mm/min" unit label + 1 material label.
    expect(textToSvg).toHaveBeenCalledTimes(8);
    expect(textToSvg).toHaveBeenCalledWith(expect.stringContaining('Plywood'), expect.any(Number));
  });

  it('references the chosen material by id in the exported metadata', () => {
    const svg = generate(baseInput());
    expect(svg).toContain(`<material id="material-1" name="Plywood" thicknessMm="3" />`);
  });
});
