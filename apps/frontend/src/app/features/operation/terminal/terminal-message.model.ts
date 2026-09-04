import { SerialMessageDirection } from '@webcutter/shared';

export interface TerminalMessage {
  id: number;
  direction: SerialMessageDirection;
  timestampMs: number;
  bytes: Uint8Array;
}

const PRINTABLE_ASCII_MIN = 0x20;
const PRINTABLE_ASCII_MAX = 0x7e;
/** \t \n \r — allowed even though they're outside the printable range above. */
const ASCII_WHITESPACE = new Set([0x09, 0x0a, 0x0d]);

/** Whether every byte is printable ASCII (or common whitespace), i.e. safe to show as text
 * rather than falling back to a hex dump. */
export function isAsciiText(bytes: Uint8Array): boolean {
  return Array.from(bytes).every(
    (byte) => (byte >= PRINTABLE_ASCII_MIN && byte <= PRINTABLE_ASCII_MAX) || ASCII_WHITESPACE.has(byte),
  );
}

export function formatMessageContent(message: TerminalMessage): string {
  if (message.bytes.length === 0) {
    return '';
  }
  return isAsciiText(message.bytes)
    ? new TextDecoder('ascii').decode(message.bytes).replace(/[\r\n]+$/, '')
    : Array.from(message.bytes)
        .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
}

/** HH:MM:SS.mmm — `Date.toLocaleTimeString` doesn't include milliseconds, hence the manual format. */
export function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  const ss = date.getSeconds().toString().padStart(2, '0');
  const millis = date.getMilliseconds().toString().padStart(3, '0');
  return `${hh}:${mm}:${ss}.${millis}`;
}
