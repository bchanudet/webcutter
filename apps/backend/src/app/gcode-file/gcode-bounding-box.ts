export interface GcodeBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const AXIS_PATTERN = {
  x: /X(-?\d*\.?\d+)/i,
  y: /Y(-?\d*\.?\d+)/i,
};

/** Scans every line of a G-code program for its X/Y target, tracking the last known value of each
 * axis across lines that only specify one of the two (as GRBL's own modal position does), and
 * returns the bounding box of every point reached — except the origin (0,0) itself, which most
 * programs pass through right after `$H` and would otherwise force the box open no matter how
 * small the actually engraved area is. Returns `null` if the program never leaves the origin. */
export function computeGcodeBoundingBox(content: string): GcodeBoundingBox | null {
  let x = 0;
  let y = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.split(';')[0].trim();
    if (!line || line.startsWith('(')) {
      continue;
    }

    const xMatch = AXIS_PATTERN.x.exec(line);
    const yMatch = AXIS_PATTERN.y.exec(line);
    if (!xMatch && !yMatch) {
      continue;
    }
    if (xMatch) {
      x = Number(xMatch[1]);
    }
    if (yMatch) {
      y = Number(yMatch[1]);
    }

    if (x === 0 && y === 0) {
      continue;
    }

    found = true;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return found ? { minX, minY, maxX, maxY } : null;
}
