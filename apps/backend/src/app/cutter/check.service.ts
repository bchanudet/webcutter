import { EventEmitter } from 'events';
import { Injectable, Logger } from '@nestjs/common';
import { CutterCommunicationService } from '@webcutter/cutter-communication';
import { CheckOutcome } from '@webcutter/shared';
import { GcodeFileService } from '../gcode-file/gcode-file.service';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs the currently uploaded G-code file through GRBL's own Check mode (`$C`): GRBL parses and
 * validates every line — including travel-limit checks — without moving the head or firing the
 * laser, catching e.g. a program that doesn't fit the bed before it's ever actually run. Emits
 * 'changed' whenever a run starts or finishes, so `CutterGateway` can broadcast it. */
@Injectable()
export class CheckService extends EventEmitter {
  private readonly logger = new Logger(CheckService.name);
  private running = false;
  private lastOutcome: CheckOutcome | null = null;

  constructor(
    private readonly cutterCommunication: CutterCommunicationService,
    private readonly gcodeFileService: GcodeFileService,
  ) {
    super();
  }

  get isRunning(): boolean {
    return this.running;
  }

  get result(): CheckOutcome | null {
    return this.lastOutcome;
  }

  /** No-op if already running or if there's no G-code file uploaded. */
  async run(): Promise<void> {
    if (this.running) {
      return;
    }
    const content = this.gcodeFileService.readContent();
    if (!content) {
      return;
    }

    this.running = true;
    this.lastOutcome = null;
    this.emit('changed');

    if (this.cutterCommunication.isAlarmed()) {
      this.finish({
        ok: false,
        message: 'The machine is alarmed — clear it with $H or $X before running a check.',
        alarmCode: null,
      });
      return;
    }

    try {
      await this.cutterCommunication.sendCommand('$C');
    } catch (error) {
      this.finish({ ok: false, message: `Could not enable check mode: ${errorMessage(error)}`, alarmCode: null });
      return;
    }

    let outcome: CheckOutcome;
    try {
      await this.cutterCommunication.sendProgram(content.split('\n'));
      outcome = { ok: true, message: 'OK — no issue found.', alarmCode: null };
    } catch (error) {
      const alarmed = this.cutterCommunication.isAlarmed();
      outcome = { ok: false, message: errorMessage(error), alarmCode: alarmed ? this.cutterCommunication.getAlarmCode() : null };
    }

    // A real alarm already forces GRBL out of check mode on its own, and trying to toggle it off
    // ourselves would instead be rejected outright by our own alarm latch (only $H/$X are let
    // through once alarmed) — so only disable it explicitly for the non-alarm outcome.
    if (outcome.alarmCode === null && !this.cutterCommunication.isAlarmed()) {
      try {
        await this.cutterCommunication.sendCommand('$C');
      } catch (error) {
        outcome = {
          ok: false,
          message: `Check finished but could not disable check mode: ${errorMessage(error)}`,
          alarmCode: outcome.alarmCode,
        };
        this.logger.error(
          'Could not disable check mode after a check.',
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.finish(outcome);
  }

  private finish(outcome: CheckOutcome): void {
    this.lastOutcome = outcome;
    this.running = false;
    this.emit('changed');
  }
}
