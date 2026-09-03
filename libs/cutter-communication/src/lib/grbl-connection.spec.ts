import { SerialPortMock } from 'serialport';

jest.mock('serialport', () => {
  const actual = jest.requireActual('serialport');
  return { ...actual, SerialPort: actual.SerialPortMock };
});

import { GrblConnection } from './grbl-connection';

const PORT_PATH = '/dev/ROBOT';

/** The subset of `MockPortBinding` these tests drive directly. */
interface MockBinding {
  emitData(data: Buffer | string): void;
  write: (buffer: Buffer) => Promise<void>;
}

function getMockBinding(connection: GrblConnection): MockBinding {
  return (connection as unknown as { port: { port: MockBinding } }).port.port;
}

/** A connected GrblConnection with a no-op 'error' listener, as any real consumer must provide. */
async function connectMock(): Promise<GrblConnection> {
  const connection = new GrblConnection();
  connection.on('error', () => undefined);
  await connection.connect({ path: PORT_PATH });
  return connection;
}

/** Lets pending stream/parser ticks (the mock binding -> ReadlineParser -> 'data' pipeline) settle
 * before asserting on state that isn't itself observed through an awaited promise. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('GrblConnection', () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
    SerialPortMock.binding.createPort(PORT_PATH);
  });

  afterEach(async () => {
    SerialPortMock.binding.reset();
  });

  it('opens the connection and reports isOpen', async () => {
    const connection = await connectMock();

    expect(connection.isOpen).toBe(true);
    await connection.disconnect();
  });

  it('rejects a second connect() while already open', async () => {
    const connection = await connectMock();

    await expect(connection.connect({ path: PORT_PATH })).rejects.toThrow(
      'Une connexion est déjà ouverte',
    );

    await connection.disconnect();
  });

  it('resolves send() when GRBL replies "ok"', async () => {
    const connection = await connectMock();

    const pending = connection.send('G0 X10');
    getMockBinding(connection).emitData('ok\r\n');

    await expect(pending).resolves.toBe('ok');
    await connection.disconnect();
  });

  it('rejects send() when GRBL replies with an error', async () => {
    const connection = await connectMock();

    const pending = connection.send('G0 X10');
    getMockBinding(connection).emitData('error:9\r\n');

    await expect(pending).rejects.toThrow('Erreur GRBL : error:9');
    await connection.disconnect();
  });

  it('sends queued commands one at a time, in order', async () => {
    const connection = await connectMock();
    const binding = getMockBinding(connection);
    const writtenCommands: string[] = [];
    const originalWrite = binding.write.bind(binding);
    binding.write = async (buffer: Buffer) => {
      writtenCommands.push(buffer.toString().trim());
      return originalWrite(buffer);
    };

    const first = connection.send('G0 X10');
    const second = connection.send('G0 Y10');

    // Only the first command should have been written before its "ok" arrives.
    await Promise.resolve();
    expect(writtenCommands).toEqual(['G0 X10']);

    binding.emitData('ok\r\n');
    await first;
    binding.emitData('ok\r\n');
    await second;

    expect(writtenCommands).toEqual(['G0 X10', 'G0 Y10']);
    await connection.disconnect();
  });

  it('parses a status report requested with requestStatus()', async () => {
    const connection = await connectMock();

    const pending = connection.requestStatus();
    getMockBinding(connection).emitData('<Idle|MPos:0.000,0.000,0.000>\r\n');

    await expect(pending).resolves.toMatchObject({
      state: 'Idle',
      machinePosition: { x: 0, y: 0, z: 0 },
    });
    await connection.disconnect();
  });

  it('rejects pending commands when disconnected', async () => {
    const connection = await connectMock();

    const pending = connection.send('G0 X10');
    await connection.disconnect();

    await expect(pending).rejects.toThrow('Connexion fermée avant réception de la réponse.');
  });

  it('rejects send() and requestStatus() when not connected', async () => {
    const connection = new GrblConnection();

    await expect(connection.send('G0 X10')).rejects.toThrow('Aucune connexion série ouverte.');
    await expect(connection.requestStatus()).rejects.toThrow('Aucune connexion série ouverte.');
  });

  describe('alarm latch', () => {
    it('latches on an ALARM: line and rejects further commands without writing them', async () => {
      const connection = await connectMock();
      const binding = getMockBinding(connection);
      const writtenCommands: string[] = [];
      const originalWrite = binding.write.bind(binding);
      binding.write = async (buffer: Buffer) => {
        writtenCommands.push(buffer.toString().trim());
        return originalWrite(buffer);
      };

      binding.emitData('ALARM:1\r\n');
      await flush();
      expect(connection.isAlarmed).toBe(true);
      expect(connection.alarmCode).toBe(1);

      await expect(connection.send('G0 X10')).rejects.toThrow('Machine en alarme');
      expect(writtenCommands).toEqual([]);

      await connection.disconnect();
    });

    it('rejects the in-flight command when an ALARM: line arrives instead of ok/error', async () => {
      const connection = await connectMock();
      const binding = getMockBinding(connection);

      const pending = connection.send('G1 X500 Y500 F600');
      binding.emitData('ALARM:2\r\n');

      await expect(pending).rejects.toThrow('ALARM:2');
      await connection.disconnect();
    });

    it('stays latched even once GRBL reports Idle again, with alarmCode null for a non-numeric code', async () => {
      const connection = await connectMock();
      const binding = getMockBinding(connection);

      binding.emitData('ALARM:Hard Limit\r\n');
      await flush();

      const pending = connection.requestStatus();
      binding.emitData('<Idle|MPos:0.000,0.000,0.000>\r\n');
      await pending;

      expect(connection.isAlarmed).toBe(true);
      expect(connection.alarmCode).toBeNull();
      await connection.disconnect();
    });

    it('clears the latch and alarmCode once $H succeeds', async () => {
      const connection = await connectMock();
      const binding = getMockBinding(connection);

      binding.emitData('ALARM:1\r\n');
      await flush();

      const pending = connection.send('$H');
      binding.emitData('ok\r\n');
      await pending;

      expect(connection.isAlarmed).toBe(false);
      expect(connection.alarmCode).toBeNull();
      await connection.disconnect();
    });

    it('clears the latch once $X succeeds', async () => {
      const connection = await connectMock();
      const binding = getMockBinding(connection);

      binding.emitData('ALARM:1\r\n');
      await flush();

      const pending = connection.send('$X');
      binding.emitData('ok\r\n');
      await pending;

      expect(connection.isAlarmed).toBe(false);
      await connection.disconnect();
    });

    it('keeps the latch if $H is sent but fails', async () => {
      const connection = await connectMock();
      const binding = getMockBinding(connection);

      binding.emitData('ALARM:1\r\n');
      await flush();

      const pending = connection.send('$H');
      binding.emitData('error:9\r\n');
      await expect(pending).rejects.toThrow();

      expect(connection.isAlarmed).toBe(true);
      await connection.disconnect();
    });

    it('resets the latch on a fresh connect()', async () => {
      const connection = await connectMock();
      const binding = getMockBinding(connection);
      binding.emitData('ALARM:1\r\n');
      await flush();
      expect(connection.isAlarmed).toBe(true);
      expect(connection.alarmCode).toBe(1);
      await connection.disconnect();

      SerialPortMock.binding.createPort(PORT_PATH);
      await connection.connect({ path: PORT_PATH });

      expect(connection.isAlarmed).toBe(false);
      expect(connection.alarmCode).toBeNull();
      await connection.disconnect();
    });
  });
});
