import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { parseGrblStatus } from './grbl-status.parser';
import { CutterPortInfo, GrblConnectionOptions, GrblStatus } from './grbl.types';

const DEFAULT_BAUD_RATE = 115200;
const STATUS_QUERY_TIMEOUT_MS = 2000;

interface QueuedCommand {
  command: string;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
}

/**
 * Manages a serial connection to a GRBL-based cutter: connection lifecycle,
 * the ok/error command queue GRBL's simple send-response protocol requires,
 * and real-time status queries.
 *
 * Emits: 'status' (GrblStatus), 'alarm' (string), 'data' (string), 'error' (Error), 'disconnected'.
 */
export class GrblConnection extends EventEmitter {
  private port: SerialPort | null = null;
  private queue: QueuedCommand[] = [];
  private awaitingResponse = false;

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

  connect(options: GrblConnectionOptions): Promise<void> {
    if (this.isOpen) {
      return Promise.reject(
        new Error('Une connexion est déjà ouverte, appelez disconnect() avant de reconnecter.'),
      );
    }

    return new Promise((resolve, reject) => {
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
            reject(error);
          }
        },
      );

      port.open((error) => {
        if (error) {
          reject(error);
          return;
        }

        this.port = port;
        const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
        parser.on('data', (line: string) => this.handleLine(line));
        port.on('close', () => this.emit('disconnected'));
        port.on('error', (portError: Error) => this.emit('error', portError));
        resolve();
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
        this.rejectPendingQueue(new Error('Connexion fermée avant réception de la réponse.'));
        resolve();
      });
    });
  }

  /** Queues a G-code/GRBL command and resolves once GRBL replies "ok" (rejects on "error:N"). */
  send(command: string): Promise<string> {
    if (!this.port?.isOpen) {
      return Promise.reject(new Error('Aucune connexion série ouverte.'));
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

  /** Sends the real-time '?' status query and resolves with the next status report. */
  requestStatus(): Promise<GrblStatus> {
    if (!this.port?.isOpen) {
      return Promise.reject(new Error('Aucune connexion série ouverte.'));
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off('status', onStatus);
        reject(new Error("Pas de réponse de la découpeuse au rapport d'état."));
      }, STATUS_QUERY_TIMEOUT_MS);

      const onStatus = (status: GrblStatus) => {
        clearTimeout(timeout);
        resolve(status);
      };

      this.once('status', onStatus);
      this.port?.write('?');
    });
  }

  private processQueue(): void {
    if (this.awaitingResponse || this.queue.length === 0 || !this.port) {
      return;
    }

    this.awaitingResponse = true;
    this.port.write(`${this.queue[0].command}\n`);
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();

    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      this.emit('status', parseGrblStatus(trimmed));
      return;
    }

    if (trimmed === 'ok') {
      this.settleCurrentCommand((command) => command.resolve(trimmed));
      return;
    }

    if (trimmed.startsWith('error:')) {
      this.settleCurrentCommand((command) =>
        command.reject(new Error(`Erreur GRBL : ${trimmed}`)),
      );
      return;
    }

    if (trimmed.startsWith('ALARM:')) {
      this.emit('alarm', trimmed);
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
