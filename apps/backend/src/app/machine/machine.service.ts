import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GcodeOrigin, SerialParity, UpdateMachineDto } from '@webcutter/shared';
import { Repository } from 'typeorm';
import { Machine } from './entities/machine.entity';

const DEFAULT_MACHINE: Omit<Machine, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'Atomstack',
  bedWidthMm: 400,
  bedHeightMm: 400,
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

@Injectable()
export class MachineService {
  constructor(@InjectRepository(Machine) private readonly machines: Repository<Machine>) {}

  async get(): Promise<Machine> {
    const machine = await this.machines.findOne({ where: {} });
    if (machine) {
      return machine;
    }
    return this.machines.save(this.machines.create(DEFAULT_MACHINE));
  }

  async update(dto: UpdateMachineDto): Promise<Machine> {
    const machine = await this.get();
    Object.assign(machine, dto);
    return this.machines.save(machine);
  }
}
