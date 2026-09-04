import { EventEmitter } from 'events';
import { Injectable, Logger } from '@nestjs/common';
import { CutterCommunicationService } from '@webcutter/cutter-communication';
import { GcodeFileService } from '../gcode-file/gcode-file.service';
import { JobStatusPayload } from '@webcutter/shared';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A line GRBL actually executes — skips blank lines and full-line comments, mirroring
 * `GcodeFileService.countCommands()` so `totalLines` matches the "Commands" count already shown
 * on the Operation page. */
function isSendableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith(';') && !trimmed.startsWith('(');
}

/** Streams the currently uploaded G-code file to the cutter one command at a time — the same
 * send-and-await-ok/error primitive as `CheckService`/`FramingService` — tracking which line is
 * currently executing so `CutterGateway` can broadcast job progress to the menubar flashcard.
 * Emits 'changed' whenever the job starts, advances, or finishes. */
@Injectable()
export class JobService extends EventEmitter {
  private readonly logger = new Logger(JobService.name);
  private running = false;
  private paused = false;
  private fileName: string | null = null;
  private currentLine = 0;
  private totalLines = 0;
  private lastError: string | null = null;
  private stopRequested = false;
  /** Resolved by `resume()` (or `stop()`, to unblock a paused job so it can observe
   * `stopRequested`) — `null` whenever not currently paused. */
  private resumeSignal: { promise: Promise<void>; resolve: () => void } | null = null;

  constructor(
    private readonly cutterCommunication: CutterCommunicationService,
    private readonly gcodeFileService: GcodeFileService,
  ) {
    super();
  }

  get isRunning(): boolean {
    return this.running;
  }

  get status(): JobStatusPayload {
    return {
      running: this.running,
      paused: this.paused,
      fileName: this.fileName,
      currentLine: this.currentLine,
      totalLines: this.totalLines,
      error: this.lastError,
    };
  }

  /** No-op if already running, there's no G-code file uploaded, or the machine is alarmed. */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    const file = this.gcodeFileService.get();
    const content = this.gcodeFileService.readContent();
    if (!file || !content || this.cutterCommunication.isAlarmed()) {
      return;
    }

    await this.cutterCommunication.sendCommand("$H");

    const lines = content.split('\n').filter(isSendableLine);

    this.running = true;
    this.stopRequested = false;
    this.fileName = file.fileName;
    this.currentLine = 0;
    this.totalLines = lines.length;
    this.lastError = null;
    this.emit('changed');

    try {
      for (const line of lines) {
        if (this.stopRequested) {
          break;
        }
        await this.waitWhilePaused();
        if (this.stopRequested) {
          break;
        }
        await this.cutterCommunication.sendCommand(line);
        this.currentLine += 1;
        this.emit('changed');
      }
    } catch (error) {
      this.lastError = errorMessage(error);
      this.logger.error('Job interrupted.', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
      this.paused = false;
      this.resumeSignal = null;
      this.emit('changed');
    }
  }

  /** Feed hold: the in-flight line (if any) still gets its normal `ok` — GRBL just doesn't
   * execute the resulting motion until `resume()` — but `start()`'s loop won't send the *next*
   * line until then either, so the job doesn't just keep queuing more moves behind the hold.
   * No-op if no job is running or it's already paused. */
  pause(): void {
    if (!this.running || this.paused) {
      return;
    }
    this.paused = true;
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    this.resumeSignal = { promise, resolve };
    this.cutterCommunication.pause();
    this.emit('changed');
  }

  /** No-op if no job is running or it isn't currently paused. */
  resume(): void {
    if (!this.running || !this.paused) {
      return;
    }
    this.paused = false;
    this.resumeSignal?.resolve();
    this.resumeSignal = null;
    this.cutterCommunication.resume();
    this.emit('changed');
  }

  /** Emergency stop: cuts communication with the cutter immediately via a real-time soft reset
   * (see `CutterCommunicationService.abort()`) instead of waiting for the in-flight line's normal
   * ok/error — that response never arriving is exactly what breaks the loop in `start()` out of
   * its `await`, ending the job. Also releases a paused job's wait so it can observe
   * `stopRequested`, without sending a real resume — there's nothing left to resume once aborted.
   * No-op if no job is running. */
  stop(): void {
    if (!this.running) {
      return;
    }
    this.stopRequested = true;
    if (this.paused) {
      this.paused = false;
      this.resumeSignal?.resolve();
      this.resumeSignal = null;
    }
    this.cutterCommunication.abort();
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.paused && this.resumeSignal) {
      await this.resumeSignal.promise;
    }
  }
}
