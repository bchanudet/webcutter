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
import { GcodeFileInfo, GcodeFileService } from '../gcode-file/gcode-file.service';
import { toGrblConnectionOptions } from '../machine/machine-connection-options';
import { MachineService } from '../machine/machine.service';
import { AutoConnectService } from './auto-connect.service';
import { CheckService } from './check.service';
import {
  CheckStatusPayload,
  JobStatusPayload,
  MachineStatusPayload,
  SerialMessageDirection,
  SerialMessagePayload,
} from './cutter-ws.types';
import { FramingService } from './framing.service';
import { JobService } from './job.service';

/** How often GRBL's own status ("Idle"/"Run"/"Home"/...) is polled and re-broadcast while the
 * machine is connected — no-op (and no serial traffic) while disconnected. */
const STATUS_POLL_INTERVAL_MS = 1000;

/** Real-time channel for the cutter's connection lifecycle, status, raw serial traffic and the
 * currently uploaded G-code file, alongside the existing REST endpoints on `CutterController` and
 * `GcodeFileController`.
 * Client -> server: `connect`, `disconnect`, `sendCommand`, `deleteGcodeFile`, `startFrame`,
 * `stopFrame`, `startCheck`, `startJob`, `stopJob`, `pauseJob`, `resumeJob`.
 * Server -> client: `status` (broadcast whenever it changes — reports a synthetic "Framing" state
 * while `FramingService` is running, see `applyFramingOverride`), `serial` (broadcast for every
 * byte sequence written to or read from the cutter — feeds the Operation page's Terminal tab),
 * `gcodeFile` (broadcast whenever the uploaded G-code file changes, so every browser on the
 * Operation page shows the same file), `checkResult` (broadcast whenever a `$C` check run starts
 * or finishes, see `CheckService`), `jobStatus` (broadcast whenever a cutting job starts, pauses,
 * resumes, advances, or finishes, see `JobService` — surfaced app-wide via the menubar flashcard,
 * and in more detail on the Operation page's "Gcode file" card).
 *
 * The connection itself isn't only opened on a `connect` message — see `AutoConnectService`, which
 * opens it on its own the moment the configured serial port becomes available. */
@WebSocketGateway({ path: '/api/ws/cutter' })
export class CutterGateway
  implements OnGatewayInit<Server>, OnGatewayConnection<WebSocket>, OnModuleDestroy
{
  private readonly logger = new Logger(CutterGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastBroadcastJson: string | null = null;
  /** Message from the most recent failed `connect` attempt or serial error — see
   * `MachineStatusPayload.connectionError`. */
  private lastConnectionError: string | null = null;

  constructor(
    private readonly cutterCommunication: CutterCommunicationService,
    private readonly machineService: MachineService,
    private readonly gcodeFileService: GcodeFileService,
    private readonly framingService: FramingService,
    private readonly checkService: CheckService,
    private readonly jobService: JobService,
    private readonly autoConnectService: AutoConnectService,
  ) {
    this.cutterCommunication.on('sent', (raw: string) => this.broadcastSerialMessage('sent', raw));
    this.cutterCommunication.on('received', (raw: string) =>
      this.broadcastSerialMessage('received', raw),
    );
    // Broadcasts the alarm-locked status immediately rather than waiting for the next poll tick
    // (up to STATUS_POLL_INTERVAL_MS later) — this is safety-relevant feedback.
    this.cutterCommunication.on('alarm', () => void this.pollAndBroadcastStatus(true));
    // A serial-level error while already connected (e.g. the USB adapter disappearing) — surface
    // it the same way a failed `connect` attempt is, rather than letting the status silently go
    // stale until the next poll notices the port closed.
    this.cutterCommunication.on('error', (error: Error) => {
      this.lastConnectionError = error.message;
      void this.pollAndBroadcastStatus(true);
    });
    this.gcodeFileService.on('changed', (info: GcodeFileInfo | null) => this.broadcastGcodeFile(info));
    // Same reasoning as 'alarm' above: framing starting/stopping should reach every client right
    // away, not on the next poll tick.
    this.framingService.on('changed', () => void this.pollAndBroadcastStatus(true));
    this.checkService.on('changed', () => this.broadcastCheckStatus());
    this.jobService.on('changed', () => this.broadcastJobStatus());
    // Not forced: an automatic attempt that fails the same way as the previous one produces the
    // exact same status payload, so the built-in dedupe in `pollAndBroadcastStatus` already keeps
    // repeated failures (every `POLL_INTERVAL_MS`, while the machine stays off) from spamming
    // every connected browser — a real change (success, or a *different* failure) still goes out
    // immediately rather than waiting for the next 1s status tick.
    this.autoConnectService.on('changed', () => {
      this.lastConnectionError = this.autoConnectService.error;
      void this.pollAndBroadcastStatus();
    });
  }

  afterInit(): void {
    this.pollInterval = setInterval(() => void this.pollAndBroadcastStatus(), STATUS_POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  /** A freshly connected client has no way to know the current status, G-code file, check run, or
   * job run yet — send all four directly, bypassing the broadcast dedupe so they don't depend on
   * the next change. */
  async handleConnection(client: WebSocket): Promise<void> {
    const payload = await this.buildStatusPayload();
    this.sendTo(client, payload);
    this.sendGcodeFileTo(client, this.gcodeFileService.get());
    this.sendCheckStatusTo(client);
    this.sendJobStatusTo(client);
  }

  @SubscribeMessage('connect')
  async handleConnectMessage(): Promise<void> {
    this.lastConnectionError = null;
    try {
      const machine = await this.machineService.get();
      await this.cutterCommunication.connect(toGrblConnectionOptions(machine));
    } catch (error) {
      this.lastConnectionError = error instanceof Error ? error.message : 'Could not connect to the cutter.';
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
    this.lastConnectionError = null;
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

  @SubscribeMessage('deleteGcodeFile')
  handleDeleteGcodeFileMessage(): void {
    this.gcodeFileService.delete();
  }

  /** Not awaited — `start()` only resolves once framing actually stops, and the gateway shouldn't
   * block handling other messages (e.g. `stopFrame`) until then. */
  @SubscribeMessage('startFrame')
  handleStartFrameMessage(): void {
    void this.framingService.start();
  }

  @SubscribeMessage('stopFrame')
  handleStopFrameMessage(): void {
    this.framingService.stop();
  }

  /** Not awaited — same reasoning as `startFrame` above. */
  @SubscribeMessage('startCheck')
  handleStartCheckMessage(): void {
    void this.checkService.run();
  }

  /** Not awaited — `start()` only resolves once the job actually finishes (or is stopped), and the
   * gateway shouldn't block handling other messages (e.g. `stopJob`) until then. */
  @SubscribeMessage('startJob')
  handleStartJobMessage(): void {
    void this.jobService.start();
  }

  /** Emergency stop — see `JobService.stop()`. */
  @SubscribeMessage('stopJob')
  handleStopJobMessage(): void {
    this.jobService.stop();
  }

  @SubscribeMessage('pauseJob')
  handlePauseJobMessage(): void {
    this.jobService.pause();
  }

  @SubscribeMessage('resumeJob')
  handleResumeJobMessage(): void {
    this.jobService.resume();
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
      return { connected: false, grbl: null, connectionError: this.lastConnectionError };
    }
    try {
      const grbl = await this.cutterCommunication.getStatus();
      return {
        connected: true,
        grbl: this.applyFramingOverride(this.applyAlarmLatch(grbl)),
        connectionError: this.lastConnectionError,
      };
    } catch {
      return {
        connected: true,
        grbl: this.cutterCommunication.isAlarmed()
          ? { state: 'Alarm', raw: '', alarmCode: this.cutterCommunication.getAlarmCode() }
          : null,
        connectionError: this.lastConnectionError,
      };
    }
  }

  /** Forces the reported state to "Alarm" while the software alarm latch is engaged, regardless
   * of what GRBL's own `?` report says — see `GrblConnection`'s `alarmed` flag for why this is
   * necessary on this board. Attaches the last known alarm code either way, so the UI can show a
   * reason whenever the state ends up "Alarm" — whether by our own latch or GRBL's own report. */
  private applyAlarmLatch(grbl: GrblStatus): GrblStatus {
    const state = this.cutterCommunication.isAlarmed() ? 'Alarm' : grbl.state;
    if (state !== 'Alarm') {
      return grbl;
    }
    return { ...grbl, state, alarmCode: this.cutterCommunication.getAlarmCode() };
  }

  /** Forces the reported state to "Framing" while `FramingService` is tracing the current G-code
   * file's bounding box — a real alarm (checked first) always takes priority over this. */
  private applyFramingOverride(grbl: GrblStatus): GrblStatus {
    if (grbl.state === 'Alarm' || !this.framingService.isFraming) {
      return grbl;
    }
    return { ...grbl, state: 'Framing' };
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

  private broadcastGcodeFile(info: GcodeFileInfo | null): void {
    this.broadcast(JSON.stringify({ event: 'gcodeFile', data: info }));
  }

  private sendGcodeFileTo(client: WebSocket, info: GcodeFileInfo | null): void {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({ event: 'gcodeFile', data: info }));
    }
  }

  private buildCheckStatusPayload(): CheckStatusPayload {
    return { running: this.checkService.isRunning, result: this.checkService.result };
  }

  private broadcastCheckStatus(): void {
    this.broadcast(JSON.stringify({ event: 'checkResult', data: this.buildCheckStatusPayload() }));
  }

  private sendCheckStatusTo(client: WebSocket): void {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({ event: 'checkResult', data: this.buildCheckStatusPayload() }));
    }
  }

  private buildJobStatusPayload(): JobStatusPayload {
    return this.jobService.status;
  }

  private broadcastJobStatus(): void {
    this.broadcast(JSON.stringify({ event: 'jobStatus', data: this.buildJobStatusPayload() }));
  }

  private sendJobStatusTo(client: WebSocket): void {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({ event: 'jobStatus', data: this.buildJobStatusPayload() }));
    }
  }
}
