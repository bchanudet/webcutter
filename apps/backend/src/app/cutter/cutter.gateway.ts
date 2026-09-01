import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { CutterCommunicationService } from '@webcutter/cutter-communication';
import { Server, WebSocket } from 'ws';
import { MachineService } from '../machine/machine.service';
import { MachineStatusPayload } from './cutter-ws.types';

/** How often GRBL's own status ("Idle"/"Run"/"Home"/...) is polled and re-broadcast while the
 * machine is connected — no-op (and no serial traffic) while disconnected. */
const STATUS_POLL_INTERVAL_MS = 1000;

/** Real-time channel for the cutter's connection lifecycle and status, alongside the existing
 * REST endpoints on `CutterController`. Client -> server: `connect`, `disconnect`.
 * Server -> client: `status`, broadcast to every connected client whenever it changes. */
@WebSocketGateway({ path: '/api/ws/cutter' })
export class CutterGateway
  implements OnGatewayInit<Server>, OnGatewayConnection<WebSocket>, OnModuleDestroy
{
  private readonly logger = new Logger(CutterGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastBroadcastJson: string | null = null;

  constructor(
    private readonly cutterCommunication: CutterCommunicationService,
    private readonly machineService: MachineService,
  ) {}

  afterInit(): void {
    this.pollInterval = setInterval(() => void this.pollAndBroadcastStatus(), STATUS_POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  /** A freshly connected client has no way to know the current status yet — send it directly,
   * bypassing the broadcast dedupe so it doesn't depend on the next status change. */
  async handleConnection(client: WebSocket): Promise<void> {
    const payload = await this.buildStatusPayload();
    this.sendTo(client, payload);
  }

  @SubscribeMessage('connect')
  async handleConnectMessage(): Promise<void> {
    try {
      const machine = await this.machineService.get();
      await this.cutterCommunication.connect({
        path: machine.serialPortPath,
        baudRate: machine.baudRate,
        dataBits: machine.dataBits as 5 | 6 | 7 | 8,
        stopBits: machine.stopBits as 1 | 1.5 | 2,
        parity: machine.parity,
      });
    } catch (error) {
      this.logger.error(
        'Could not connect to the cutter.',
        error instanceof Error ? error.stack : undefined,
      );
    }
    await this.pollAndBroadcastStatus(true);
  }

  /** Closes the serial connection; every command the rest of the app issues afterwards already
   * fails fast (`CutterCommunicationService.isConnected()` / the serial port being closed), so no
   * separate "locked" flag is needed — the machine simply stays unusable until `connect` reopens it. */
  @SubscribeMessage('disconnect')
  async handleDisconnectMessage(): Promise<void> {
    await this.cutterCommunication.disconnect();
    await this.pollAndBroadcastStatus(true);
  }

  private async pollAndBroadcastStatus(force = false): Promise<void> {
    const payload = await this.buildStatusPayload();
    const json = JSON.stringify({ event: 'status', data: payload });
    if (!force && json === this.lastBroadcastJson) {
      return;
    }
    this.lastBroadcastJson = json;
    this.broadcast(json);
  }

  private async buildStatusPayload(): Promise<MachineStatusPayload> {
    if (!this.cutterCommunication.isConnected()) {
      return { connected: false, grbl: null };
    }
    try {
      const grbl = await this.cutterCommunication.getStatus();
      return { connected: true, grbl };
    } catch {
      return { connected: true, grbl: null };
    }
  }

  private broadcast(json: string): void {
    for (const client of this.server.clients) {
      if (client.readyState === client.OPEN) {
        client.send(json);
      }
    }
  }

  private sendTo(client: WebSocket, payload: MachineStatusPayload): void {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({ event: 'status', data: payload }));
    }
  }
}
