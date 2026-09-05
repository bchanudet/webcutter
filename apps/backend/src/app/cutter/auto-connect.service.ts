import { access, constants } from 'fs/promises';
import { EventEmitter } from 'events';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CutterCommunicationService } from '@webcutter/cutter-communication';
import { toGrblConnectionOptions } from '../machine/machine-connection-options';
import { MachineService } from '../machine/machine.service';

/** How often to check whether the configured serial port has become available — a plain poll
 * rather than a filesystem watch: `/dev` device nodes come and go outside Node's control (udev,
 * the kernel), a watch would still need a fallback poll for platforms/setups where it doesn't fire,
 * and a 1s poll is already imperceptible for something that only matters when the machine is
 * physically being plugged in or powered on. */
const POLL_INTERVAL_MS = 1000;

/** Automatic (re)connection is opt-in via this environment variable — a dev/CI/agent session
 * running the backend (e.g. just to check it boots, or to run tests) must never silently open the
 * real serial port. Set it (e.g. in the physical dev setup's own `npm run serve` invocation) only
 * where a real machine is actually meant to be attached. */
const ALLOW_PHYSICAL_CONNECTION_ENV_VAR = 'ALLOW_PHYSICAL_CONNECTION';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Connects to the cutter automatically the moment its configured serial port becomes available —
 * so a machine that's physically off/unplugged gets picked back up on its own once it's powered on
 * or plugged in, without the user having to notice and click "Connect". Only ever acts while
 * disconnected: a poll tick is a complete no-op whenever `CutterCommunicationService.isConnected()`
 * is already true, whatever the reason (already connected, or a connect attempt — manual or from a
 * previous tick — still in flight).
 *
 * Entirely disabled unless `ALLOW_PHYSICAL_CONNECTION=true` is set in the environment (see
 * `ALLOW_PHYSICAL_CONNECTION_ENV_VAR` above) — see `CLAUDE.md`.
 *
 * Emits 'changed' after every attempt it makes (success or failure), carrying the outcome in
 * `error`, so `CutterGateway` can fold it into the same `connectionError` it already broadcasts for
 * a manual "Connect" click. */
@Injectable()
export class AutoConnectService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoConnectService.name);
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private connecting = false;
  private lastError: string | null = null;

  constructor(
    private readonly cutterCommunication: CutterCommunicationService,
    private readonly machineService: MachineService,
  ) {
    super();
  }

  /** Message from the most recent automatic connection attempt, or `null` if it succeeded (or none
   * has been made yet). */
  get error(): string | null {
    return this.lastError;
  }

  onModuleInit(): void {
    if (process.env[ALLOW_PHYSICAL_CONNECTION_ENV_VAR] !== 'true') {
      this.logger.warn(
        `Automatic connection to the cutter is disabled (set ${ALLOW_PHYSICAL_CONNECTION_ENV_VAR}=true to enable it — only where a real machine is actually meant to be attached).`,
      );
      return;
    }
    this.pollInterval = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  private async tick(): Promise<void> {
    if (this.connecting || this.cutterCommunication.isConnected()) {
      return;
    }

    const machine = await this.machineService.get();

    try {
      await access(machine.serialPortPath, constants.R_OK | constants.W_OK);
    } catch {
      // Not there (or not accessible) yet — completely expected while the machine is off, nothing
      // to log or report; just try again on the next tick.
      return;
    }

    this.connecting = true;
    try {
      await this.cutterCommunication.connect(toGrblConnectionOptions(machine));
      this.lastError = null;
    } catch (error) {
      this.lastError = errorMessage(error);
      this.logger.warn(`Automatic connection to ${machine.serialPortPath} failed: ${this.lastError}`);
    } finally {
      this.connecting = false;
      this.emit('changed');
    }
  }
}
