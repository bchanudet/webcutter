import { Machine, SerialParity } from './entities/machine.entity';
import { toGrblConnectionOptions } from './machine-connection-options';

describe('toGrblConnectionOptions', () => {
  it('maps the machine entity fields GrblConnection.connect() expects', () => {
    const machine = {
      serialPortPath: '/dev/ttyUSB0',
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: SerialParity.NONE,
    } as Machine;

    expect(toGrblConnectionOptions(machine)).toEqual({
      path: '/dev/ttyUSB0',
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: SerialParity.NONE,
    });
  });
});
