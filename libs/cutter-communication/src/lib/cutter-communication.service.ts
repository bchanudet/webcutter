import { EventEmitter } from 'events';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { GrblConnection } from './grbl-connection';
import { CutterPortInfo, GrblConnectionOptions, GrblStatus } from './grbl.types';

/**
 * Emits (in addition to lifecycle logging): 'sent' (string, raw bytes written to the cutter),
 * 'received' (string, raw line read back) — forwarded from the underlying `GrblConnection` so
 * consumers (e.g. the WebSocket gateway) don't need to reach into connection internals.
 */
@Injectable()
export class CutterCommunicationService extends EventEmitter implements OnModuleDestroy {
  private readonly logger = new Logger(CutterCommunicationService.name);
  private readonly connection = new GrblConnection();

  constructor() {
    super();
    this.connection.on('error', (error: Error) => this.logger.error(error.message, error.stack));
    this.connection.on('alarm', (message: string) => this.logger.warn(message));
    this.connection.on('disconnected', () => this.logger.log('Découpeuse déconnectée.'));
    this.connection.on('sent', (raw: string) => this.emit('sent', raw));
    this.connection.on('received', (raw: string) => this.emit('received', raw));
  }

  listAvailablePorts(): Promise<CutterPortInfo[]> {
    return GrblConnection.listPorts();
  }

  async connect(options: GrblConnectionOptions): Promise<void> {
    this.logger.log(`Connexion à la découpeuse sur ${options.path}`);
    await this.connection.connect(options);
  }

  disconnect(): Promise<void> {
    return this.connection.disconnect();
  }

  isConnected(): boolean {
    return this.connection.isOpen;
  }

  /** Whether the connection is software-alarm-locked (see `GrblConnection`) — stays true across
   * `?` status reports until $H or $X actually succeeds, even if the board itself has silently
   * reset out of its own alarm state. */
  isAlarmed(): boolean {
    return this.connection.isAlarmed;
  }

  sendCommand(command: string): Promise<string> {
    return this.connection.send(command);
  }

  sendProgram(lines: string[]): Promise<void> {
    return this.connection.sendProgram(lines);
  }

  getStatus(): Promise<GrblStatus> {
    return this.connection.requestStatus();
  }

  onModuleDestroy(): void {
    if (this.connection.isOpen) {
      void this.connection.disconnect();
    }
  }
}
