import { EventEmitter } from 'events';
import { Injectable, Logger } from '@nestjs/common';
import { CutterCommunicationService } from '@webcutter/cutter-communication';
import { computeGcodeBoundingBox } from '../gcode-file/gcode-bounding-box';
import { GcodeFileService } from '../gcode-file/gcode-file.service';
import { MachineService } from '../machine/machine.service';
import { JobService } from './job.service';

/** Laser power for the framing trace — deliberately very low, just enough to see the beam. */
const FRAMING_POWER_PERCENT = 0.5;

/** GRBL's reply on this Atomstack when its physical "Frame" button is pressed but nothing has
 * registered a task for it to report against — that button is normally only wired up to the
 * Atomstack Android app (which does register one), so our software just gets this message back
 * with no other effect. Hijacked here as a free physical trigger for framing instead: load a file
 * from the browser, walk over to the machine, and press its own button to trace the bounding box —
 * no browser needed at that point, and pressing it again re-frames after adjusting the material. */
const AUTO_FRAME_TRIGGER_MESSAGE = '[MSG:No Cached Tasks]';

/** Traces the bounding box of the currently uploaded G-code program once, at very low laser power,
 * so the user can check the engraved area actually fits the material before running the real job.
 * Emits 'changed' whenever framing starts or stops, so `CutterGateway` can broadcast the new status
 * immediately instead of waiting for the next status poll. */
@Injectable()
export class FramingService extends EventEmitter {
  private readonly logger = new Logger(FramingService.name);
  private framing = false;
  private stopRequested = false;

  constructor(
    private readonly cutterCommunication: CutterCommunicationService,
    private readonly gcodeFileService: GcodeFileService,
    private readonly machineService: MachineService,
    private readonly jobService: JobService,
  ) {
    super();
    this.cutterCommunication.on('received', (raw: string) => {
      if (raw.trim() === AUTO_FRAME_TRIGGER_MESSAGE) {
        void this.start();
      }
    });
  }

  get isFraming(): boolean {
    return this.framing;
  }

  /** No-op if already framing, if a cutting job is currently running (the physical Frame button
   * shouldn't be able to interrupt one), or if there's no G-code file — or it never leaves the
   * origin, so it has no meaningful bounding box. Traces the 4 corners of the box once and stops;
   * `stop()` can still cut that short, and so does any rejected command (e.g. the machine alarms)
   * — either way `finish()` always attempts to turn the laser back off and re-home. */
  async start(): Promise<void> {
    if (this.framing || this.jobService.isRunning) {
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
      const feed = Math.round(Math.min(machine.travelSpeedXMmPerMin, machine.travelSpeedYMmPerMin));

      await this.cutterCommunication.sendCommand('$H');
      await this.cutterCommunication.sendCommand('G90');
      await this.cutterCommunication.sendCommand(`M4 S${power}`);

      // The starting corner is repeated at the end to close the rectangle — this used to be a
      // single lap of an endless loop, where the next lap's first move did that same job.
      const corners = [
        { x: bbox.minX, y: bbox.minY },
        { x: bbox.maxX, y: bbox.minY },
        { x: bbox.maxX, y: bbox.maxY },
        { x: bbox.minX, y: bbox.maxY },
        { x: bbox.minX, y: bbox.minY },
      ];

      for (const corner of corners) {
        if (this.stopRequested) {
          break;
        }
        await this.cutterCommunication.sendCommand(
          `G1 X${corner.x.toFixed(3)} Y${corner.y.toFixed(3)} F${feed}`,
        );
      }
    } catch (error) {
      this.logger.error('Framing interrupted.', error instanceof Error ? error.stack : undefined);
    } finally {
      await this.finish();
    }
  }

  /** Lets the currently in-flight move (if any) finish, then breaks out of the corner loop in
   * `start()` early — `finish()` there takes care of turning the laser off and re-homing either
   * way. */
  stop(): void {
    this.stopRequested = true;
  }

  private async finish(): Promise<void> {
    try {
      await this.cutterCommunication.sendCommand('M5');
      // Homing is a costly operation, no need to do it in the end.
      await this.cutterCommunication.sendCommand('G0 X0 Y0');
    } catch (error) {
      this.logger.error('Could not cleanly stop framing.', error instanceof Error ? error.stack : undefined);
    } finally {
      this.framing = false;
      this.emit('changed');
    }
  }
}
