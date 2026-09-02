import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { CutterCommunicationService, GrblStatus } from '@webcutter/cutter-communication';
import { Server, WebSocket } from 'ws';
import { MachineService } from '../machine/machine.service';
import { MachineStatusPayload, SerialMessageDirection, SerialMessagePayload } from './cutter-ws.types';

/** How often GRBL's own status ("Idle"/"Run"/"Home"/...) is polled and re-broadcast while the
 * machine is connected — no-op (and no serial traffic) while disconnected. */
const STATUS_POLL_INTERVAL_MS = 1000;

/** Real-time channel for the cutter's connection lifecycle, status and raw serial traffic,
 * alongside the existing REST endpoints on `CutterController`.
 * Client -> server: `connect`, `disconnect`, `sendCommand`.
 * Server -> client: `status` (broadcast whenever it changes), `serial` (broadcast for every byte
 * sequence written to or read from the cutter — feeds the Operation page's Terminal tab). */
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
  ) {
    this.cutterCommunication.on('sent', (raw: string) => this.broadcastSerialMessage('sent', raw));
    this.cutterCommunication.on('received', (raw: string) =>
      this.broadcastSerialMessage('received', raw),
    );
    // Broadcasts the alarm-locked status immediately rather than waiting for the next poll tick
    // (up to STATUS_POLL_INTERVAL_MS later) — this is safety-relevant feedback.
    this.cutterCommunication.on('alarm', () => void this.pollAndBroadcastStatus(true));
  }

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

  /** Sends a raw, user-typed command (Operation page Terminal tab). The command and GRBL's
   * response reach every client through the regular `sent`/`received` -> `serial` broadcast, so
   * there's nothing else to do here beyond not letting a rejected command (GRBL "error:N") crash
   * the gateway. */
  @SubscribeMessage('sendCommand')
  async handleSendCommandMessage(@MessageBody() data: { command?: string }): Promise<void> {
    const command = data?.command?.trim();
    if (!command) {
      return;
    }
    try {
      await this.cutterCommunication.sendCommand(command);
    } catch (error) {
      this.logger.warn(`Command "${command}" failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  private broadcastSerialMessage(direction: SerialMessageDirection, raw: string): void {
    const payload: SerialMessagePayload = {
      direction,
      timestampMs: Date.now(),
      dataBase64: Buffer.from(raw, 'utf-8').toString('base64'),
    };
    this.broadcast(JSON.stringify({ event: 'serial', data: payload }));
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
      return { connected: true, grbl: this.applyAlarmLatch(grbl) };
    } catch {
      return {
        connected: true,
        grbl: this.cutterCommunication.isAlarmed() ? { state: 'Alarm', raw: '' } : null,
      };
    }
  }

  /** Forces the reported state to "Alarm" while the software alarm latch is engaged, regardless
   * of what GRBL's own `?` report says — see `GrblConnection`'s `alarmed` flag for why this is
   * necessary on this board. */
  private applyAlarmLatch(grbl: GrblStatus): GrblStatus {
    if (!this.cutterCommunication.isAlarmed()) {
      return grbl;
    }
    return { ...grbl, state: 'Alarm' };
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
