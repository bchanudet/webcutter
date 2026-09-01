import { Injectable, signal } from '@angular/core';
import { TerminalMessage, TerminalMessageDirection } from './terminal-message.model';

/** Provided in root so the log survives navigating away from and back to the Operation page —
 * it will later be fed by the serial connection's WebSocket stream. */
@Injectable({ providedIn: 'root' })
export class TerminalLogService {
  private nextMessageId = 0;

  private readonly _messages = signal<TerminalMessage[]>([]);
  readonly messages = this._messages.asReadonly();

  recordSent(data: string | Uint8Array): void {
    this.record('sent', data);
  }

  recordReceived(data: string | Uint8Array): void {
    this.record('received', data);
  }

  private record(direction: TerminalMessageDirection, data: string | Uint8Array): void {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const message: TerminalMessage = {
      id: this.nextMessageId++,
      direction,
      timestampMs: Date.now(),
      bytes,
    };
    this._messages.update((messages) => [...messages, message]);
  }
}
