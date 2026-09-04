import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { parseGrblStatus } from './grbl-status.parser';
import { CutterPortInfo, GrblConnectionOptions, GrblStatus } from '@webcutter/shared';

const DEFAULT_BAUD_RATE = 115200;
const STATUS_QUERY_TIMEOUT_MS = 2000;

interface QueuedCommand {
  command: string;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
}

/** Whether `command` is GRBL's home ($H) or unlock ($X) command — the only two commands allowed
 * to go through while the connection is alarm-locked, and the ones that clear the lock. */
function isUnlockCommand(command: string): boolean {
  const normalized = command.trim().toUpperCase();
  return normalized === '$H' || normalized === '$X';
}

/**
 * Manages a serial connection to a GRBL-based cutter: connection lifecycle,
 * the ok/error command queue GRBL's simple send-response protocol requires,
 * and real-time status queries.
 *
 * Emits: 'status' (GrblStatus), 'alarm' (string), 'data' (string), 'error' (Error), 'disconnected',
 * 'sent' (string, raw bytes written), 'received' (string, raw line read).
 */
export class GrblConnection extends EventEmitter {
  private port: SerialPort | null = null;
  private queue: QueuedCommand[] = [];
  private awaitingResponse = false;
  /** Set for the duration of a `connect()` call — guards against two callers racing to open the
   * port at once (e.g. a manual "Connect" click landing mid-tick of `AutoConnectService`'s poll):
   * `isOpen` alone doesn't catch this, since it only turns true once `port.open()` has already
   * finished. */
  private connecting = false;
  /** Software-side alarm latch: some boards (e.g. this Atomstack clone) silently reset and
   * report "Idle" again after a hard-limit alarm without the user ever sending $H/$X — this
   * flag keeps the connection locked down regardless of what `?` reports until one of those two
   * commands actually succeeds, so the rest of the app can't be misled into thinking it's safe. */
  private alarmed = false;
  /** The numeric code of the last `ALARM:N` line received (e.g. `1` for a hard limit) — cleared
   * together with `alarmed`, so it always describes the alarm currently latched, not a stale one. */
  private lastAlarmCode: number | null = null;

  static listPorts(): Promise<CutterPortInfo[]> {
    return SerialPort.list().then((ports) =>
      ports.map((port) => ({
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
      })),
    );
  }

  get isOpen(): boolean {
    return this.port?.isOpen ?? false;
  }

  get isAlarmed(): boolean {
    return this.alarmed;
  }

  get alarmCode(): number | null {
    return this.lastAlarmCode;
  }

  connect(options: GrblConnectionOptions): Promise<void> {
    if (this.isOpen) {
      return Promise.reject(
        new Error('A connection is already open — call disconnect() before reconnecting.'),
      );
    }
    if (this.connecting) {
      return Promise.reject(new Error('A connection attempt is already in progress.'));
    }

    this.connecting = true;
    this.alarmed = false;
    this.lastAlarmCode = null;

    return new Promise((resolve, reject) => {
      const settle = (error: Error | null | undefined) => {
        this.connecting = false;
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      const port = new SerialPort(
        {
          path: options.path,
          baudRate: options.baudRate ?? DEFAULT_BAUD_RATE,
          dataBits: options.dataBits,
          stopBits: options.stopBits,
          parity: options.parity,
          autoOpen: false,
        },
        (error) => {
          if (error) {
            settle(error);
          }
        },
      );

      port.open((error) => {
        if (error) {
          settle(error);
          return;
        }

        this.port = port;
        const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
        parser.on('data', (line: string) => this.handleLine(line));
        port.on('close', () => this.emit('disconnected'));
        port.on('error', (portError: Error) => this.emit('error', portError));
        settle(null);
      });
    });
  }

  disconnect(): Promise<void> {
    if (!this.port?.isOpen) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.port?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        this.port = null;
        this.rejectPendingQueue(new Error('Connection closed before the response was received.'));
        resolve();
      });
    });
  }

  /** Queues a G-code/GRBL command and resolves once GRBL replies "ok" (rejects on "error:N").
   * Rejects immediately, without writing anything to the port, if the connection is alarm-locked
   * and this isn't the $H/$X command that would clear it. */
  send(command: string): Promise<string> {
    if (!this.port?.isOpen) {
      return Promise.reject(new Error('No open serial connection.'));
    }

    if (this.alarmed && !isUnlockCommand(command)) {
      return Promise.reject(
        new Error(
          'Machine is alarmed: send $H (home) or $X (unlock) before any other command.',
        ),
      );
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ command, resolve, reject });
      this.processQueue();
    });
  }

  /** Sends a full G-code program, one command at a time, stopping on the first error. */
  async sendProgram(lines: string[]): Promise<void> {
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith(';')) {
        continue;
      }
      await this.send(trimmed);
    }
  }

  /** Emergency stop: writes GRBL's real-time soft-reset byte (Ctrl-X) directly to the port,
   * bypassing the ok/error queue entirely — unlike `send()`, this doesn't wait for the in-flight
   * command's response, because the whole point is not waiting. GRBL aborts whatever move is in
   * progress and turns the laser/spindle off on its own as part of the reset. Also engages the
   * same software alarm latch a real `ALARM:` does (see `alarmed`): GRBL may come back up
   * reporting "Idle" without ever having actually re-homed, and the rest of the app shouldn't be
   * able to send a fresh command until $H/$X explicitly clears it. No-op if not connected. */
  abort(): void {
    if (!this.port?.isOpen) {
      return;
    }
    this.write('\x18');
    this.alarmed = true;
    this.lastAlarmCode = null;
    this.rejectPendingQueue(new Error("Emergency stop: communication interrupted by the operator."));
  }

  /** Feed hold: writes GRBL's real-time hold byte ('!') directly to the port, bypassing the
   * ok/error queue — GRBL decelerates to a stop and reports state "Hold" via its own status
   * report, no different from any other cause of a hold. Unlike `abort()`, this doesn't reject
   * the in-flight command or touch the alarm latch: nothing has gone wrong, and GRBL still sends
   * that command's `ok` once it's accepted into the planner, hold or not. No-op if not connected. */
  pause(): void {
    if (!this.port?.isOpen) {
      return;
    }
    this.write('!');
  }

  /** Cycle start/resume: writes GRBL's real-time resume byte ('~') directly to the port, the
   * counterpart to `pause()`. No-op if not connected. */
  resume(): void {
    if (!this.port?.isOpen) {
      return;
    }
    this.write('~');
  }

  /** Sends the real-time '?' status query and resolves with the next status report. */
  requestStatus(): Promise<GrblStatus> {
    if (!this.port?.isOpen) {
      return Promise.reject(new Error('No open serial connection.'));
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off('status', onStatus);
        reject(new Error("No response from the cutter to the status report."));
      }, STATUS_QUERY_TIMEOUT_MS);

      const onStatus = (status: GrblStatus) => {
        clearTimeout(timeout);
        resolve(status);
      };

      this.once('status', onStatus);
      this.write('?');
    });
  }

  private processQueue(): void {
    if (this.awaitingResponse || this.queue.length === 0 || !this.port) {
      return;
    }

    this.awaitingResponse = true;
    this.write(`${this.queue[0].command}\n`);
  }

  /** Writes raw bytes to the serial port and emits them on 'sent' — the single funnel every
   * outgoing write goes through, so listeners (e.g. a terminal UI) see the exact wire traffic. */
  private write(data: string): void {
    this.port?.write(data);
    this.emit('sent', data);
  }

  private handleLine(line: string): void {
    this.emit('received', line);
    const trimmed = line.trim();

    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      this.emit('status', parseGrblStatus(trimmed));
      return;
    }

    if (trimmed === 'ok') {
      this.settleCurrentCommand((command) => {
        if (isUnlockCommand(command.command)) {
          this.alarmed = false;
          this.lastAlarmCode = null;
        }
        command.resolve(trimmed);
      });
      return;
    }

    if (trimmed.startsWith('error:')) {
      this.settleCurrentCommand((command) =>
        command.reject(new Error(`GRBL error: ${trimmed}`)),
      );
      return;
    }

    if (trimmed.startsWith('ALARM:')) {
      this.alarmed = true;
      const code = Number(trimmed.slice('ALARM:'.length));
      this.lastAlarmCode = Number.isFinite(code) ? code : null;
      this.emit('alarm', trimmed);
      // An ALARM: line can arrive instead of the ok/error a queued command was waiting for (e.g. a
      // travel-limit violation caught mid-program by `sendProgram`/Check mode) — without this, that
      // command's promise would simply never settle. A no-op if nothing is currently in flight.
      this.settleCurrentCommand((command) => command.reject(new Error(`GRBL alarm: ${trimmed}`)));
      return;
    }

    this.emit('data', trimmed);
  }

  private settleCurrentCommand(settle: (command: QueuedCommand) => void): void {
    const current = this.queue.shift();
    this.awaitingResponse = false;
    if (current) {
      settle(current);
    }
    this.processQueue();
  }

  private rejectPendingQueue(error: Error): void {
    const pending = this.queue.splice(0);
    this.awaitingResponse = false;
    pending.forEach((command) => command.reject(error));
  }
}
