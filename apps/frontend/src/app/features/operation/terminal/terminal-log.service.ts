import { Injectable, inject, signal } from '@angular/core';
import { CutterSocketService } from '../machine-status/cutter-socket.service';
import { SerialMessagePayload } from '../machine-status/machine-status.model';
import { TerminalMessage } from './terminal-message.model';

/** Provided in root so the log survives navigating away from and back to the Operation page.
 * Fed entirely by `CutterSocketService.serialMessages$` — the real bytes written to and read from
 * the cutter's serial port, broadcast by the backend gateway. */
@Injectable({ providedIn: 'root' })
export class TerminalLogService {
  private readonly cutterSocket = inject(CutterSocketService);
  private nextMessageId = 0;

  private readonly _messages = signal<TerminalMessage[]>([]);
  readonly messages = this._messages.asReadonly();

  constructor() {
    this.cutterSocket.serialMessages$.subscribe((payload) => this.append(payload));
  }

  /** Empties the log — messages already broadcast are gone for good, this only clears the local
   * copy (the backend doesn't keep any history of its own to resync from). */
  clear(): void {
    this._messages.set([]);
  }

  private append(payload: SerialMessagePayload): void {
    const message: TerminalMessage = {
      id: this.nextMessageId++,
      direction: payload.direction,
      timestampMs: payload.timestampMs,
      bytes: this.decodeBase64(payload.dataBase64),
    };
    this._messages.update((messages) => [...messages, message]);
  }

  private decodeBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
}
