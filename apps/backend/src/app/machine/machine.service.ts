import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GcodeOrigin, Machine, SerialParity } from './entities/machine.entity';
import { UpdateMachineDto } from './dto/update-machine.dto';

const DEFAULT_MACHINE: Omit<Machine, 'id' | 'createdAt' | 'updatedAt'> = {
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
  maxAccelerationXMmPerSec2: 500,
  maxAccelerationYMmPerSec2: 500,
  maxSpeedXMmPerSec: 200,
  maxSpeedYMmPerSec: 200,
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
