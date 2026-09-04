import { Repository } from 'typeorm';
import { MachineService } from './machine.service';
import { GcodeOrigin, Machine, SerialParity } from './entities/machine.entity';

describe('MachineService', () => {
  let service: MachineService;
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    service = new MachineService(repo as unknown as Repository<Machine>);
  });

  it('creates a default machine record when none exists yet', async () => {
    repo.findOne.mockResolvedValue(null);

    const machine = await service.get();

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ serialPortPath: '/dev/ttyUSB0', baudRate: 115200 }),
    );
    expect(machine).toMatchObject({ serialPortPath: '/dev/ttyUSB0', baudRate: 115200 });
  });

  it('returns the existing machine record without creating a new one', async () => {
    const machine = { id: 1, bedWidthMm: 300, bedHeightMm: 200 };
    repo.findOne.mockResolvedValue(machine);

    await expect(service.get()).resolves.toBe(machine);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('merges the given fields onto the singleton record when updating', async () => {
    const machine = {
      id: 1,
      name: 'Atomstack',
      bedWidthMm: 300,
      bedHeightMm: 200,
      serialPortPath: '/dev/ttyUSB0',
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: SerialParity.NONE,
      mirrorX: false,
      mirrorY: false,
      origin: GcodeOrigin.BOTTOM_LEFT,
      offsetXMm: 0,
      offsetYMm: 0,
      maxAccelerationXMmPerSec2: 500,
      maxAccelerationYMmPerSec2: 500,
      maxSpeedXMmPerMin: 12000,
      maxSpeedYMmPerMin: 12000,
      travelSpeedXMmPerMin: 12000,
      travelSpeedYMmPerMin: 12000,
      sMax: 1000,
    };
    repo.findOne.mockResolvedValue(machine);

    const updated = await service.update({ ...machine, bedWidthMm: 500 });

    expect(updated).toMatchObject({ bedWidthMm: 500, bedHeightMm: 200 });
  });
});
