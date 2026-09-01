import { Injectable, OnDestroy, signal } from '@angular/core';
import { MachineStatusPayload } from './machine-status.model';

const RECONNECT_DELAY_MS = 2000;

interface IncomingMessage {
  event: string;
  data: unknown;
}

/** Client for the `/api/ws/cutter` WebSocket: keeps `status` in sync with the backend's broadcasts
 * and sends the `connect`/`disconnect` commands. Reconnects automatically (e.g. after a backend
 * restart) so the page doesn't need to be reloaded to recover. */
@Injectable({ providedIn: 'root' })
export class CutterSocketService implements OnDestroy {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  readonly status = signal<MachineStatusPayload>({ connected: false, grbl: null });

  constructor() {
    this.open();
  }

  connect(): void {
    this.send('connect');
  }

  disconnect(): void {
    this.send('disconnect');
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.socket?.close();
  }

  private open(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/cutter`);
    socket.addEventListener('message', (event) => this.handleMessage(event));
    socket.addEventListener('close', () => this.scheduleReconnect());
    socket.addEventListener('error', () => socket.close());
    this.socket = socket;
  }

  private scheduleReconnect(): void {
    if (this.destroyed) {
      return;
    }
    this.reconnectTimer = setTimeout(() => this.open(), RECONNECT_DELAY_MS);
  }

  private handleMessage(event: MessageEvent<string>): void {
    let message: IncomingMessage;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.event === 'status') {
      this.status.set(message.data as MachineStatusPayload);
    }
  }

  private send(event: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event, data: {} }));
    }
  }
}
