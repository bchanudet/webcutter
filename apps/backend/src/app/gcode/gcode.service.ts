import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Gcode } from './entities/gcode.entity';
import { CreateGcodeDto } from './dto/create-gcode.dto';
import { UpdateGcodeDto } from './dto/update-gcode.dto';

@Injectable()
export class GcodeService {
  constructor(@InjectRepository(Gcode) private readonly gcodes: Repository<Gcode>) {}

  findAll(): Promise<Gcode[]> {
    return this.gcodes.find({ order: { hook: 'ASC', order: 'ASC' } });
  }

  async findOneOrThrow(id: number): Promise<Gcode> {
    const gcode = await this.gcodes.findOne({ where: { id } });
    if (!gcode) {
      throw new NotFoundException(`Gcode ${id} not found.`);
    }
    return gcode;
  }

  create(dto: CreateGcodeDto): Promise<Gcode> {
    return this.gcodes.save(this.gcodes.create(dto));
  }

  async update(id: number, dto: UpdateGcodeDto): Promise<Gcode> {
    const gcode = await this.findOneOrThrow(id);
    Object.assign(gcode, dto);
    return this.gcodes.save(gcode);
  }

  async remove(id: number): Promise<void> {
    await this.findOneOrThrow(id);
    await this.gcodes.delete(id);
  }
}
