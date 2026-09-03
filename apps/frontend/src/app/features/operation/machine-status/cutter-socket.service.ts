import { Injectable, OnDestroy, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { GcodeFileInfo } from '../gcode-file/gcode-file.model';
import {
  CheckStatusPayload,
  JobStatusPayload,
  MachineStatusPayload,
  SerialMessagePayload,
} from './machine-status.model';

const RECONNECT_DELAY_MS = 2000;

interface IncomingMessage {
  event: string;
  data: unknown;
}

/** Client for the `/api/ws/cutter` WebSocket: keeps `status`, `gcodeFile`, `checkStatus` and
 * `jobStatus` in sync with the backend's broadcasts, streams raw serial traffic via
 * `serialMessages$`, and sends the `connect`/`disconnect`/`sendCommand`/`deleteGcodeFile`/
 * `startFrame`/`stopFrame`/`startCheck`/`startJob`/`stopJob`/`pauseJob`/`resumeJob` commands.
 * Reconnects automatically (e.g. after a backend restart) so the page doesn't need to be reloaded
 * to recover. */
@Injectable({ providedIn: 'root' })
export class CutterSocketService implements OnDestroy {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  readonly status = signal<MachineStatusPayload>({ connected: false, grbl: null, connectionError: null });
  readonly serialMessages$ = new Subject<SerialMessagePayload>();
  /** The G-code file currently uploaded, kept in sync across every browser on the Operation page —
   * pushed by the server on connect and on every change (upload/delete), not fetched over REST. */
  readonly gcodeFile = signal<GcodeFileInfo | null>(null);
  /** Whether the *browser's own* WebSocket to the backend is currently open — distinct from
   * `status().connected`, which is whether the *backend* is connected to the cutter's serial port.
   * `false` means every other signal here is stale until reconnection succeeds. */
  readonly wsConnected = signal(false);
  /** State of the last (or currently running) `$C` check — see `startCheck()`. */
  readonly checkStatus = signal<CheckStatusPayload>({ running: false, result: null });
  /** State of the last (or currently running) cutting job — see `startJob()`. Drives the menubar
   * flashcard's progress bar and emergency stop button on every page, not just Operation. */
  readonly jobStatus = signal<JobStatusPayload>({
    running: false,
    paused: false,
    fileName: null,
    currentLine: 0,
    totalLines: 0,
    error: null,
  });

  constructor() {
    this.open();
  }

  connect(): void {
    this.send('connect');
  }

  disconnect(): void {
    this.send('disconnect');
  }

  sendCommand(command: string): void {
    this.send('sendCommand', { command });
  }

  deleteGcodeFile(): void {
    this.send('deleteGcodeFile');
  }

  startFrame(): void {
    this.send('startFrame');
  }

  stopFrame(): void {
    this.send('stopFrame');
  }

  startCheck(): void {
    this.send('startCheck');
  }

  startJob(): void {
    this.send('startJob');
  }

  /** Emergency stop — cuts communication with the cutter immediately, see the backend's
   * `JobService.stop()`. */
  stopJob(): void {
    this.send('stopJob');
  }

  pauseJob(): void {
    this.send('pauseJob');
  }

  resumeJob(): void {
    this.send('resumeJob');
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.socket?.close();
    this.serialMessages$.complete();
  }

  private open(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/cutter`);
    socket.addEventListener('open', () => this.wsConnected.set(true));
    socket.addEventListener('message', (event) => this.handleMessage(event));
    socket.addEventListener('close', () => {
      this.wsConnected.set(false);
      this.scheduleReconnect();
    });
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
    } else if (message.event === 'serial') {
      this.serialMessages$.next(message.data as SerialMessagePayload);
    } else if (message.event === 'gcodeFile') {
      this.gcodeFile.set(message.data as GcodeFileInfo | null);
    } else if (message.event === 'checkResult') {
      this.checkStatus.set(message.data as CheckStatusPayload);
    } else if (message.event === 'jobStatus') {
      this.jobStatus.set(message.data as JobStatusPayload);
    }
  }

  private send(event: string, data: unknown = {}): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event, data }));
    }
  }
}
