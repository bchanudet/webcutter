import { GrblConnectionOptions } from '@webcutter/cutter-communication';
import { Machine } from './entities/machine.entity';

/** Maps the machine's stored serial settings to what `GrblConnection.connect()` expects — shared
 * by the manual "Connect" button (`CutterGateway`) and the automatic reconnection poll
 * (`AutoConnectService`) so both open the port exactly the same way. */
export function toGrblConnectionOptions(machine: Machine): GrblConnectionOptions {
  return {
    path: machine.serialPortPath,
    baudRate: machine.baudRate,
    dataBits: machine.dataBits as 5 | 6 | 7 | 8,
    stopBits: machine.stopBits as 1 | 1.5 | 2,
    parity: machine.parity,
  };
}
