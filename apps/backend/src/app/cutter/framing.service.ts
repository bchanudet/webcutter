import { EventEmitter } from 'events';
import { Injectable, Logger } from '@nestjs/common';
import { CutterCommunicationService } from '@webcutter/cutter-communication';
import { computeGcodeBoundingBox } from '../gcode-file/gcode-bounding-box';
import { GcodeFileService } from '../gcode-file/gcode-file.service';
import { MachineService } from '../machine/machine.service';

/** Laser power for the framing trace — deliberately very low, just enough to see the beam. */
const FRAMING_POWER_PERCENT = 0.5;

/** Traces the bounding box of the currently uploaded G-code program at very low laser power, so
 * the user can check the engraved area actually fits the material before running the real job —
 * loops the 4 corners until `stop()` is called (or the machine rejects a command, e.g. because it
 * hit a real alarm). Emits 'changed' whenever framing starts or stops, so `CutterGateway` can
 * broadcast the new status immediately instead of waiting for the next status poll. */
@Injectable()
export class FramingService extends EventEmitter {
  private readonly logger = new Logger(FramingService.name);
  private framing = false;
  private stopRequested = false;

  constructor(
    private readonly cutterCommunication: CutterCommunicationService,
    private readonly gcodeFileService: GcodeFileService,
    private readonly machineService: MachineService,
  ) {
    super();
  }

  get isFraming(): boolean {
    return this.framing;
  }

  /** No-op if already framing, or if there's no G-code file (or it never leaves the origin, so it
   * has no meaningful bounding box). Runs until `stop()` resolves `stopRequested`, or a command is
   * rejected (e.g. the machine alarms) — either way `finish()` always attempts to turn the laser
   * back off and re-home. */
  async start(): Promise<void> {
    if (this.framing) {
      return;
    }
    const content = this.gcodeFileService.readContent();
    const bbox = content ? computeGcodeBoundingBox(content) : null;
    if (!bbox) {
      return;
    }

    this.framing = true;
    this.stopRequested = false;
    this.emit('changed');

    try {
      const machine = await this.machineService.get();
      const power = Math.round((FRAMING_POWER_PERCENT / 100) * machine.sMax);
      const feed = Math.round(Math.min(machine.maxSpeedXMmPerMin, machine.maxSpeedYMmPerMin));

      await this.cutterCommunication.sendCommand('$H');
      await this.cutterCommunication.sendCommand('G90');
      await this.cutterCommunication.sendCommand(`M4 S${power}`);

      const corners = [
        { x: bbox.minX, y: bbox.minY },
        { x: bbox.maxX, y: bbox.minY },
        { x: bbox.maxX, y: bbox.maxY },
        { x: bbox.minX, y: bbox.maxY },
      ];

      while (!this.stopRequested) {
        for (const corner of corners) {
          if (this.stopRequested) {
            break;
          }
          await this.cutterCommunication.sendCommand(
            `G1 X${corner.x.toFixed(3)} Y${corner.y.toFixed(3)} F${feed}`,
          );
        }
        await this.cutterCommunication.sleepMs(2500);
      }
    } catch (error) {
      this.logger.error('Framing interrupted.', error instanceof Error ? error.stack : undefined);
    } finally {
      await this.finish();
    }
  }

  /** Lets the currently in-flight move (if any) finish, then breaks out of the loop in `start()` —
   * `finish()` there takes care of turning the laser off and re-homing. */
  stop(): void {
    this.stopRequested = true;
  }

  private async finish(): Promise<void> {
    try {
      await this.cutterCommunication.sendCommand('M5');
      await this.cutterCommunication.sendCommand('$H');
    } catch (error) {
      this.logger.error('Could not cleanly stop framing.', error instanceof Error ? error.stack : undefined);
    } finally {
      this.framing = false;
      this.emit('changed');
    }
  }
}
