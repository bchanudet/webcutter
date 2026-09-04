import { inject, Injectable } from '@angular/core';
import { forkJoin, map, Observable, of } from 'rxjs';
import { Material, ProfileMode, SVG_NS, WEBCUTTER_NS } from '@webcutter/shared';
import { FontApiService } from './font-api.service';

export type TestPatternShape = 'square' | 'circle';

export interface GenerateTestPatternInput {
  mode: ProfileMode;
  shape: TestPatternShape;
  material: Material;
  powerMinPercent: number;
  powerMaxPercent: number;
  speedMinMmPerMin: number;
  speedMaxMmPerMin: number;
  steps: number;
  includeMaterialLabel: boolean;
  includeLegends: boolean;
  /** The cutting surface a generated pattern must never exceed (see `assemble`). */
  surfaceWidthMm: number;
  surfaceHeightMm: number;
}

/** Rendered height of every legend/material-label text (see FontService on the backend). */
const LEGEND_TEXT_HEIGHT_MM = 4;
/** Gap kept between a legend/label and whatever it sits next to. */
const LEGEND_PADDING_MM = 2;
/** A grid cell's shape occupies this fraction of the cell, leaving the rest as a gap. */
const SHAPE_FILL_RATIO = 0.7;
const CIRCLE_SEGMENTS = 48;
const PATTERN_SHAPE_COLOR = '#FF7300';
/** Green rather than a neutral dark gray so the legend/label profile stays clearly visible
 * against a dark theme too, not just the default light one. */
const LEGEND_COLOR = '#22C55E';
/** Legends/material label are informational marks, not part of the power/speed matrix under
 * test — a single fixed, conservative profile for all of them, deliberately not tied to the
 * min/max range the user is testing. */
const LEGEND_POWER_PERCENT = 50;
const LEGEND_SPEED_MM_PER_MIN = 6000;
const DEFAULT_LINE_SPACING_MM = 0.1;

interface ProfileXmlInput {
  id: string;
  materialId: string;
  name: string;
  color: string;
  mode: ProfileMode;
  powerPercent: number;
  speedMmPerMin: number;
  passes: number;
  lineSpacingMm: number | null;
}

interface EmbeddedText {
  markup: string;
  widthMm: number;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function escapeXmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function circlePoints(cx: number, cy: number, radius: number): { x: number; y: number }[] {
  return Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => {
    const angle = (i / CIRCLE_SEGMENTS) * 2 * Math.PI;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

function squarePoints(cx: number, cy: number, side: number): { x: number; y: number }[] {
  const half = side / 2;
  return [
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
  ];
}

function closedPathD(points: { x: number; y: number }[]): string {
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')} Z`;
}

function getProfileColor(stepX:number, maxX:number, stepY: number, maxY: number): string {
  return '#A0'
      +  (Math.floor(stepX/maxX*128+64)).toString(16).padStart(2,'0')
      +  (Math.floor(stepY/maxY*128+64)).toString(16).padStart(2,'0');
}

/**
 * Builds a "test pattern" workspace document: a `steps` x `steps` grid of squares/circles, each
 * with its own temporary profile interpolating power (increasing left to right) and speed
 * (decreasing top to bottom) between the dialog's min/max — see docs/workspace-svg-format.md for
 * the format this produces, which is the same one a "Save workspace SVG" export or the "Add text"
 * tool already generate, so the result is loaded back exactly the same way (`addDocumentFromSource`
 * on `SvgToGcodePage`), profiles and all, without needing any dedicated import path.
 */
@Injectable({ providedIn: 'root' })
export class TestPatternGeneratorService {
  private readonly fontApi = inject(FontApiService);

  generate(input: GenerateTestPatternInput): Observable<string> {
    const steps = input.steps;
    const columnPowers = Array.from({ length: steps }, (_, col) =>
      round1(lerp(input.powerMinPercent, input.powerMaxPercent, steps === 1 ? 0 : col / (steps - 1))),
    );
    const rowSpeeds = Array.from({ length: steps }, (_, row) =>
      round1(lerp(input.speedMaxMmPerMin, input.speedMinMmPerMin, steps === 1 ? 0 : row / (steps - 1))),
    );

    const textRequests: { key: string; text: string }[] = [];
    if (input.includeLegends) {
      // "%" is short enough to just repeat on the column axis's last tick, but "mm/min" is wide
      // enough to visibly eat into the space left for the shapes themselves — spelled out once,
      // top-left, above the row axis's largest value (row 0, since speed decreases top to
      // bottom — see `assemble`), instead of repeated on every row.
      columnPowers.forEach((power, col) =>
        textRequests.push({ key: `col-${col}`, text: col === steps - 1 ? `${power}%` : `${power}` }),
      );
      rowSpeeds.forEach((speed, row) => textRequests.push({ key: `row-${row}`, text: `${speed}` }));
      textRequests.push({ key: 'speed-unit', text: 'mm/min' });
    }
    if (input.includeMaterialLabel) {
      textRequests.push({
        key: 'material',
        text: `${input.material.name} - ${input.material.thicknessMm} mm`,
      });
    }

    const texts$ =
      textRequests.length === 0
        ? of(new Map<string, string>())
        : forkJoin(
            textRequests.map((request) =>
              this.fontApi
                .textToSvg(request.text, LEGEND_TEXT_HEIGHT_MM)
                .pipe(map((result) => [request.key, result.svg] as const)),
            ),
          ).pipe(map((entries) => new Map(entries)));

    return texts$.pipe(map((textSvgs) => this.assemble(input, columnPowers, rowSpeeds, textSvgs)));
  }

  /** Lays out the grid + legends within `surfaceWidthMm x surfaceHeightMm` and serializes the
   * final workspace SVG — legend/label text may be individually shrunk (see `embedText`) to keep
   * the whole pattern from ever exceeding that surface. "%" is only spelled out on the column
   * axis's last tick (see the calling `generate()`); "mm/min" instead gets its own standalone
   * label in the grid's top-left corner, above the row axis's largest value, rather than being
   * repeated on every row, to leave more room for the number itself in each cell's tight legend
   * width. */
  private assemble(
    input: GenerateTestPatternInput,
    columnPowers: number[],
    rowSpeeds: number[],
    textSvgs: Map<string, string>,
  ): string {
    const steps = input.steps;

    const rowLegendWidth = input.includeLegends
      ? LEGEND_PADDING_MM * 2 +
        Math.max(
          0,
          this.textWidth(textSvgs.get('speed-unit')),
          ...rowSpeeds.map((_, row) => this.textWidth(textSvgs.get(`row-${row}`))),
        )
      : 0;
    const colLegendHeight = input.includeLegends ? LEGEND_PADDING_MM * 2 + LEGEND_TEXT_HEIGHT_MM : 0;
    const materialLabelHeight = input.includeMaterialLabel ? LEGEND_PADDING_MM * 2 + LEGEND_TEXT_HEIGHT_MM : 0;

    const availableWidth = input.surfaceWidthMm - rowLegendWidth;
    const availableHeight = input.surfaceHeightMm - colLegendHeight - materialLabelHeight;
    const cellSize = Math.max(1, Math.min(availableWidth, availableHeight) / steps);
    const shapeSize = cellSize * SHAPE_FILL_RATIO;

    const gridOriginX = rowLegendWidth;
    const gridOriginY = colLegendHeight;

    const fill = input.mode === 'FILL' ? PATTERN_SHAPE_COLOR : 'none';
    const stroke = input.mode === 'FILL' ? 'transparent' : PATTERN_SHAPE_COLOR;

    const profiles: string[] = [];
    const contentPaths: string[] = [];

    for (let row = 0; row < steps; row++) {
      for (let col = 0; col < steps; col++) {
        const profileId = crypto.randomUUID();
        const powerPercent = columnPowers[col];
        const speedMmPerMin = rowSpeeds[row];
        profiles.push(
          this.buildProfileXml({
            id: profileId,
            materialId: input.material.id,
            name: `Test ${powerPercent}% / ${speedMmPerMin} mm/min`,
            color: getProfileColor(col, steps, row, steps),
            mode: input.mode,
            powerPercent,
            speedMmPerMin,
            passes: 1,
            lineSpacingMm: input.mode === 'FILL' ? DEFAULT_LINE_SPACING_MM : null,
          }),
        );

        const cx = gridOriginX + cellSize * (col + 0.5);
        const cy = gridOriginY + cellSize * (row + 0.5);
        const points =
          input.shape === 'circle' ? circlePoints(cx, cy, shapeSize / 2) : squarePoints(cx, cy, shapeSize);
        contentPaths.push(
          `<path id="cell-${row}-${col}" d="${closedPathD(points)}" fill-rule="evenodd" ` +
            `transform="matrix(1 0 0 1 0 0)" fill="${fill}" stroke="${stroke}" stroke-width="0.3" ` +
            `profile="${profileId}" />`,
        );
      }
    }

    let legendProfileId: string | null = null;
    if (input.includeLegends || input.includeMaterialLabel) {
      legendProfileId = crypto.randomUUID();
      profiles.push(
        this.buildProfileXml({
          id: legendProfileId,
          materialId: input.material.id,
          name: 'Test pattern legend',
          color: LEGEND_COLOR,
          mode: ProfileMode.FILL,
          powerPercent: LEGEND_POWER_PERCENT,
          speedMmPerMin: LEGEND_SPEED_MM_PER_MIN,
          passes: 1,
          lineSpacingMm: DEFAULT_LINE_SPACING_MM,
        }),
      );
    }

    if (input.includeLegends && legendProfileId) {
      const unitSvg = textSvgs.get('speed-unit');
      if (unitSvg) {
        contentPaths.push(
          this.embedText(unitSvg, legendProfileId, LEGEND_PADDING_MM, LEGEND_PADDING_MM, 'left', null).markup,
        );
      }
      for (let col = 0; col < steps; col++) {
        const svg = textSvgs.get(`col-${col}`);
        if (!svg) {
          continue;
        }
        const x = gridOriginX + cellSize * (col + 0.5);
        contentPaths.push(
          this.embedText(svg, legendProfileId, x, LEGEND_PADDING_MM, 'center', cellSize * 0.95).markup,
        );
      }
      for (let row = 0; row < steps; row++) {
        const svg = textSvgs.get(`row-${row}`);
        if (!svg) {
          continue;
        }
        const y = gridOriginY + cellSize * (row + 0.5) - LEGEND_TEXT_HEIGHT_MM / 2;
        contentPaths.push(
          this.embedText(svg, legendProfileId, LEGEND_PADDING_MM, y, 'left', null).markup,
        );
      }
    }

    if (input.includeMaterialLabel && legendProfileId) {
      const svg = textSvgs.get('material');
      if (svg) {
        const x = input.surfaceWidthMm / 2;
        const y = input.surfaceHeightMm - materialLabelHeight + LEGEND_PADDING_MM;
        contentPaths.push(
          this.embedText(svg, legendProfileId, x, y, 'center', input.surfaceWidthMm - LEGEND_PADDING_MM * 2).markup,
        );
      }
    }

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
      `<svg xmlns="${SVG_NS}" width="${input.surfaceWidthMm}mm" height="${input.surfaceHeightMm}mm" ` +
      `viewBox="0 0 ${input.surfaceWidthMm} ${input.surfaceHeightMm}">` +
      `<metadata><webcutter xmlns="${WEBCUTTER_NS}"><version>1</version><profiles>${profiles.join('')}</profiles>` +
      `<material id="${escapeXmlAttribute(input.material.id)}" name="${escapeXmlAttribute(input.material.name)}" ` +
      `thicknessMm="${input.material.thicknessMm}" /></webcutter></metadata>` +
      `<g id="content">${contentPaths.join('')}</g></svg>`
    );
  }

  private textWidth(svg: string | undefined): number {
    if (!svg) {
      return 0;
    }
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    return Number.parseFloat(root.getAttribute('width') ?? '0') || 0;
  }

  /** Re-emits a font-generated text SVG's glyphs (see `FontService`, `AddTextDialog`) as direct
   * children of the workspace's own `<g id="content">`, each carrying `legendProfileId` — a
   * nested `<g>` isn't an option here: the backend's workspace parser only ever looks at direct
   * `<path>` children of `content` (see docs/workspace-svg-format.md), the same constraint that
   * already shapes how "Add text" and `buildWorkspaceContentGroup()` produce their own output.
   * Each glyph's own `transform="translate(x 0) scale(s)"` is folded into a single combined
   * `matrix(...)`, together with this text's placement (`x`/`y`, anchored by `align`) and an
   * extra shrink factor if its natural width would otherwise exceed `maxWidthMm`. */
  private embedText(
    svg: string,
    profileId: string,
    x: number,
    y: number,
    align: 'left' | 'center',
    maxWidthMm: number | null,
  ): EmbeddedText {
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    const width = Number.parseFloat(root.getAttribute('width') ?? '0') || 0;
    const extraScale = maxWidthMm != null && width > maxWidthMm && width > 0 ? maxWidthMm / width : 1;
    const finalWidth = width * extraScale;
    const offsetX = align === 'center' ? x - finalWidth / 2 : x;

    const paths: string[] = [];
    for (const child of Array.from(root.children)) {
      if (child.tagName.toLowerCase() !== 'path') {
        continue;
      }
      const transform = child.getAttribute('transform') ?? '';
      const match = /translate\(\s*([+-]?[\d.]+)\s+0\s*\)\s*scale\(\s*([+-]?[\d.]+)\s*\)/.exec(transform);
      const charX = match ? Number(match[1]) : 0;
      const scale = match ? Number(match[2]) : 1;
      const combinedScale = scale * extraScale;
      const e = extraScale * charX + offsetX;
      const d = child.getAttribute('d') ?? '';
      paths.push(
        `<path d="${escapeXmlAttribute(d)}" fill-rule="evenodd" ` +
          `transform="matrix(${combinedScale} 0 0 ${combinedScale} ${e} ${y})" ` +
          `fill="${LEGEND_COLOR}" stroke="transparent" stroke-width="0.3" profile="${profileId}" />`,
      );
    }

    return { markup: paths.join(''), widthMm: finalWidth };
  }

  private buildProfileXml(profile: ProfileXmlInput): string {
    const lineSpacing = profile.lineSpacingMm != null ? ` lineSpacingMm="${profile.lineSpacingMm}"` : '';
    return (
      `<profile id="${escapeXmlAttribute(profile.id)}" materialId="${escapeXmlAttribute(profile.materialId)}" ` +
      `name="${escapeXmlAttribute(profile.name)}" color="${profile.color}" type="${profile.mode}" ` +
      `powerPercent="${profile.powerPercent}" speedMmPerMin="${profile.speedMmPerMin}" ` +
      `passes="${profile.passes}"${lineSpacing} />`
    );
  }
}
