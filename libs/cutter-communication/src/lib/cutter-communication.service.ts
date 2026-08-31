import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { GrblConnection } from './grbl-connection';
import { CutterPortInfo, GrblConnectionOptions, GrblStatus } from './grbl.types';

@Injectable()
export class CutterCommunicationService implements OnModuleDestroy {
  private readonly logger = new Logger(CutterCommunicationService.name);
  private readonly connection = new GrblConnection();

  constructor() {
    this.connection.on('error', (error: Error) => this.logger.error(error.message, error.stack));
    this.connection.on('alarm', (message: string) => this.logger.warn(message));
    this.connection.on('disconnected', () => this.logger.log('Découpeuse déconnectée.'));
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
