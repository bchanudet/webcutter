import { Test } from '@nestjs/testing';
import { CutterCommunicationService } from './cutter-communication.service';
import { GrblConnection } from './grbl-connection';

jest.mock('./grbl-connection');

describe('CutterCommunicationService', () => {
  let service: CutterCommunicationService;
  let connection: jest.Mocked<GrblConnection>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [CutterCommunicationService],
    }).compile();

    service = module.get(CutterCommunicationService);
    connection = (service as unknown as { connection: jest.Mocked<GrblConnection> }).connection;
  });

  it('should be defined', () => {
    expect(service).toBeTruthy();
  });

  it('delegates connect() to the underlying GRBL connection', async () => {
    connection.connect.mockResolvedValue(undefined);

    await service.connect({ path: '/dev/ttyUSB0' });

    expect(connection.connect).toHaveBeenCalledWith({ path: '/dev/ttyUSB0' });
  });

  it('delegates sendCommand() and returns the GRBL response', async () => {
    connection.send.mockResolvedValue('ok');

    await expect(service.sendCommand('G0 X10')).resolves.toBe('ok');
    expect(connection.send).toHaveBeenCalledWith('G0 X10');
  });

  it('delegates getStatus() to requestStatus()', async () => {
    const status = { state: 'Idle' as const, raw: '<Idle>' };
    connection.requestStatus.mockResolvedValue(status);

    await expect(service.getStatus()).resolves.toBe(status);
  });

  it('reflects the connection open state', () => {
    Object.defineProperty(connection, 'isOpen', { value: true });
    expect(service.isConnected()).toBe(true);
  });

  it('disconnects the connection on module destroy when open', () => {
    Object.defineProperty(connection, 'isOpen', { value: true });
    connection.disconnect.mockResolvedValue(undefined);

    service.onModuleDestroy();

    expect(connection.disconnect).toHaveBeenCalled();
  });
});
