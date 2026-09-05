import { parseGcodeProgram } from './gcode-program-parser';

/** Renders a small preview of a G-code program's toolpath onto an offscreen canvas and returns it as
 * a base64-encoded PNG (no `data:` URL prefix) — used to snapshot "what the job looks like" the
 * moment a job starts (see `GcodeFileCard.startJob()`), for the History page's thumbnails.
 *
 * Deliberately not a DOM/SVG screenshot of the Viewer tab: that tab may not even be mounted when
 * "Start" is clicked (the Operation page's three tabs share one `<router-outlet>`), and its SVG
 * relies on external stylesheet classes a raw serialization would lose. Reusing `parseGcodeProgram`
 * directly on the raw G-code text sidesteps both problems — only G1 (cut) segments are drawn, scaled
 * and centered to fit `size`, since G0 travel moves aren't part of the visible result. */
export function renderGcodeThumbnail(content: string, size = 64): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return '';
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const segments = parseGcodeProgram(content).filter((segment) => segment.type === 'G1');
  if (segments.length > 0) {
    const xs = segments.flatMap((segment) => [segment.x1, segment.x2]);
    const ys = segments.flatMap((segment) => [segment.y1, segment.y2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 1e-6);
    const spanY = Math.max(maxY - minY, 1e-6);
    const margin = 0.1;
    const scale = (size * (1 - 2 * margin)) / Math.max(spanX, spanY);
    const offsetX = (size - spanX * scale) / 2;
    const offsetY = (size - spanY * scale) / 2;
    // G-code is Y-up; canvas is Y-down — flip so the thumbnail isn't upside down.
    const toCanvas = (x: number, y: number) => ({
      cx: offsetX + (x - minX) * scale,
      cy: size - (offsetY + (y - minY) * scale),
    });

    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const segment of segments) {
      const from = toCanvas(segment.x1, segment.y1);
      const to = toCanvas(segment.x2, segment.y2);
      ctx.moveTo(from.cx, from.cy);
      ctx.lineTo(to.cx, to.cy);
    }
    ctx.stroke();
  }

  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}
