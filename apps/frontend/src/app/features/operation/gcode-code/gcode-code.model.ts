export interface CodeToken {
  text: string;
  /** `null` for plain, unstyled text (whitespace, punctuation, a letter not covered by any rule
   * below). Otherwise one of 'comment' | 'g0' | 'g1' | 'mcode' | 'param' | 'number' — see
   * `gcode-code-panel.scss` for what each looks like. */
  cls: string | null;
}

export interface CodeLine {
  raw: string;
  tokens: CodeToken[];
  /** 0-based index among only the "sendable" lines — `null` for a blank line or a full-line
   * comment, neither of which the backend's `JobService` ever actually sends (see
   * `isSendableCodeLine`). Lets a row be matched up against `JobStatusPayload.currentLine`, which
   * counts the same way. */
  sendableIndex: number | null;
}

/** A G-code "word": a letter immediately followed by a number, wherever it appears in the line —
 * matches how `gcode-program-parser.ts` tokenizes for parsing, for the same reason: real files
 * don't reliably put whitespace between words (e.g. LightBurn's `Y-14.22S200F6000`). */
const WORD_PATTERN = /([A-Za-z])(-?\d*\.?\d+)/g;

/** The parameter letters that get the orange "param" treatment — every other letter (N, T, P...)
 * stays unstyled, even though the *number* after it still gets colored (see `tokenizeGcodeLine`). */
const PARAM_LETTERS = new Set(['X', 'Y', 'S', 'F']);

/** A line GRBL actually executes — skips blank lines and full-line comments. Mirrors the backend's
 * `JobService`/`GcodeFileService` `isSendableLine`/`countCommands` exactly, so `CodeLine.sendableIndex`
 * lines up with `JobStatusPayload.currentLine` one for one. */
export function isSendableCodeLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith(';') && !trimmed.startsWith('(');
}

/** Splits a single line of G-code into syntax-highlighted tokens:
 * - A full-line comment (starts with `;`) becomes one `'comment'` token for the whole line.
 * - Otherwise, any trailing `; ...` is split off and becomes its own `'comment'` token, so a
 *   trailing comment doesn't get its text mistaken for code (e.g. a hex id containing letter+digit
 *   runs, as this app's own generator's own `; Path <uuid> — profile "..."` comments do — though
 *   those specifically are full-line, not trailing, and so already short-circuit above).
 * - `G0`/`G1` (by numeric value, so `G00`/`G01` count too — same rule `gcode-program-parser.ts`
 *   uses for parsing) become one `'g0'`/`'g1'` token for the whole word.
 * - Any `M<number>` word becomes one `'mcode'` token for the whole word.
 * - Every other word is split into its letter (`'param'` if it's X/Y/S/F, unstyled otherwise) and
 *   its number (always `'number'`) as two separate tokens.
 * - Everything else (whitespace, punctuation) passes through unstyled. */
export function tokenizeGcodeLine(line: string): CodeToken[] {
  const trimmed = line.trim();
  if (trimmed.startsWith(';')) {
    return [{ text: line, cls: 'comment' }];
  }

  const commentIndex = line.indexOf(';');
  const code = commentIndex === -1 ? line : line.slice(0, commentIndex);
  const comment = commentIndex === -1 ? '' : line.slice(commentIndex);

  const tokens: CodeToken[] = [];
  let lastIndex = 0;
  for (const match of code.matchAll(WORD_PATTERN)) {
    const [word, rawLetter, rawNumber] = match;
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ text: code.slice(lastIndex, index), cls: null });
    }

    const letter = rawLetter.toUpperCase();
    if (letter === 'G' && Number(rawNumber) === 0) {
      tokens.push({ text: word, cls: 'g0' });
    } else if (letter === 'G' && Number(rawNumber) === 1) {
      tokens.push({ text: word, cls: 'g1' });
    } else if (letter === 'M') {
      tokens.push({ text: word, cls: 'mcode' });
    } else {
      tokens.push({ text: rawLetter, cls: PARAM_LETTERS.has(letter) ? 'param' : null });
      tokens.push({ text: rawNumber, cls: 'number' });
    }
    lastIndex = index + word.length;
  }
  if (lastIndex < code.length) {
    tokens.push({ text: code.slice(lastIndex), cls: null });
  }
  if (comment) {
    tokens.push({ text: comment, cls: 'comment' });
  }
  return tokens;
}

/** Parses a whole G-code file into one `CodeLine` per raw line (blank lines included, so row
 * indices match up 1:1 with what a user scrolling the file actually sees), tokenized for syntax
 * highlighting and numbered for progress tracking. */
export function parseCodeLines(content: string): CodeLine[] {
  let sendableIndex = 0;
  return content.split('\n').map((raw) => {
    const sendable = isSendableCodeLine(raw);
    return {
      raw,
      tokens: tokenizeGcodeLine(raw),
      sendableIndex: sendable ? sendableIndex++ : null,
    };
  });
}
