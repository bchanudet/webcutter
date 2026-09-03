import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseXml, XmlElement } from '../workspace/xml-parser';

const FALLBACK_NAME = 'undefined';
const DEFAULT_HEIGHT_MM = 10;

/** Rounds to a millimeter precision well beyond what any laser can resolve, just to keep the
 * generated markup readable — floating-point scaling (e.g. `610 * (10 / 1000)`) otherwise litters
 * every coordinate with a long tail of spurious digits. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** One rendered character: its own advance width/height (read from its source file's `viewBox`,
 * see `parseGlyph`) and either the single `<path>` to place directly, or — for the handful of
 * glyphs that aren't just that, e.g. the non-printable placeholders — every child of its source
 * `<svg>` to instead wrap in a `<g>`. */
interface Glyph {
  advanceWidth: number;
  height: number;
  path: XmlElement | null;
  children: XmlElement[];
}

function escapeXmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function serializeAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeXmlAttribute(value)}"`)
    .join(' ');
}

/** Serializes an already-parsed element back to markup — only needed for the rare glyph that
 * isn't a single `<path>` (see `Glyph.children`), so this never has to handle text content. */
function serializeElement(element: XmlElement): string {
  const attrs = serializeAttributes(element.attributes);
  const openTag = attrs ? `<${element.tagName} ${attrs}` : `<${element.tagName}`;
  if (element.children.length === 0) {
    return `${openTag} />`;
  }
  return `${openTag}>${element.children.map(serializeElement).join('')}</${element.tagName}>`;
}

/**
 * Renders a single line of text to a standalone SVG by concatenating pre-made glyph SVGs, one
 * per Unicode codepoint, from `apps/backend/src/assets/font/<codepoint>.svg` — themselves a
 * straight per-character export of some source font (single `<path>`, `fill="currentColor"`,
 * a `viewBox` whose width is that glyph's advance and whose height is constant across the whole
 * set). A character with no matching file falls back to `undefined.svg` (e.g. glyphs outside the
 * exported set); a few codepoints (e.g. the font's own control-character placeholders) have no
 * `<path>` at all, which is where the "or a `<g>`" fallback in `renderGlyphElement` is for.
 *
 * The output's `viewBox`/`width`/`height` are in millimeters (1 unit = 1mm), scaled from the
 * glyphs' own font units so `heightMm` is the text's actual rendered height — matching the
 * workspace SVG's own convention (see docs/workspace-svg-format.md) of the frontend's flattener
 * always trusting `viewBox` for a document's size, over any unit suffix on `width`/`height`.
 */
@Injectable()
export class FontService {
  private readonly glyphCache = new Map<string, Glyph>();
  private fontDir: string | null = null;

  renderText(text: string, heightMm: number = DEFAULT_HEIGHT_MM): string {
    const glyphs = Array.from(text).map((char) => this.loadGlyph(char.codePointAt(0) ?? 0));
    const fontHeight = glyphs[0]?.height ?? 1000;
    const scale = heightMm / fontHeight;

    let cursor = 0;
    const elements = glyphs.map((glyph) => {
      const markup = this.renderGlyphElement(glyph, round(cursor * scale), scale);
      cursor += glyph.advanceWidth;
      return markup;
    });

    const widthMm = round(cursor * scale);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" ` +
      `viewBox="0 0 ${widthMm} ${heightMm}">${elements.join('')}</svg>`
    );
  }

  /** `xMm` and `scale` together place this glyph's own font-unit geometry (e.g. up to ~600 units
   * wide, 1000 tall) at its correct millimeter position: `scale` shrinks it from font units to mm,
   * `translate` (applied to the already-scaled result, since it comes first in the transform list)
   * then shifts it to `xMm`, its cumulative advance so far converted to mm. */
  private renderGlyphElement(glyph: Glyph, xMm: number, scale: number): string {
    // `scale` itself isn't rounded like the mm coordinates below are: it's always a clean decimal
    // already (heightMm divided by the font's fixed 1000-unit height), and rounding it to
    // millimeter precision would instead introduce error — multiplied back up by a glyph's ~600
    // font units, a barely-visible rounding at this stage would become a real positioning error.
    const transform = `translate(${xMm} 0) scale(${scale})`;
    if (glyph.path) {
      const attributes = { ...glyph.path.attributes, transform };
      return `<path ${serializeAttributes(attributes)} />`;
    }
    return `<g transform="${transform}">${glyph.children.map(serializeElement).join('')}</g>`;
  }

  private loadGlyph(codepoint: number): Glyph {
    const key = String(codepoint);
    const cached = this.glyphCache.get(key);
    if (cached) {
      return cached;
    }

    const glyph = this.tryReadGlyphFile(key) ?? this.loadFallbackGlyph();
    this.glyphCache.set(key, glyph);
    return glyph;
  }

  private loadFallbackGlyph(): Glyph {
    const cached = this.glyphCache.get(FALLBACK_NAME);
    if (cached) {
      return cached;
    }
    const glyph = this.tryReadGlyphFile(FALLBACK_NAME);
    if (!glyph) {
      throw new Error(`Fichier de glyphe de secours introuvable : "${FALLBACK_NAME}.svg".`);
    }
    this.glyphCache.set(FALLBACK_NAME, glyph);
    return glyph;
  }

  private tryReadGlyphFile(name: string): Glyph | null {
    const filePath = join(this.getFontDir(), `${name}.svg`);
    if (!existsSync(filePath)) {
      return null;
    }
    return this.parseGlyph(readFileSync(filePath, 'utf-8'));
  }

  private parseGlyph(source: string): Glyph {
    const root = parseXml(source);
    const viewBox = root.attributes['viewBox']?.trim().split(/\s+/).map(Number);
    if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite)) {
      throw new Error('Le SVG de glyphe ne contient pas de viewBox valide.');
    }
    const [, , width, height] = viewBox;

    const path = root.children.length === 1 && root.children[0].tagName === 'path' ? root.children[0] : null;
    return { advanceWidth: width, height, path, children: root.children };
  }

  /** `__dirname` at runtime points at wherever this module actually lives — the bundled backend
   * (`dist/apps/backend/main.js`, everything inlined by webpack) vs. running the source directly
   * (e.g. under ts-jest, one compiled file per source file) put that at different depths relative
   * to `assets/font` (see `webpack.config.js`'s `assets: ['./src/assets']`), so both are tried. */
  private getFontDir(): string {
    if (this.fontDir) {
      return this.fontDir;
    }
    const candidates = [join(__dirname, 'assets', 'font'), join(__dirname, '..', '..', 'assets', 'font')];
    const found = candidates.find((dir) => existsSync(dir));
    if (!found) {
      throw new Error(`Dossier des polices introuvable (essayé : ${candidates.join(', ')}).`);
    }
    this.fontDir = found;
    return found;
  }
}
