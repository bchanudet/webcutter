import { Body, Controller, Get, Put } from '@nestjs/common';
import { MachineService } from './machine.service';
import { UpdateMachineDto } from './dto/update-machine.dto';

@Controller('machine')
export class MachineController {
  constructor(private readonly machine: MachineService) {}

  @Get()
  get() {
    return this.machine.get();
  }

  @Put()
  update(@Body() dto: UpdateMachineDto) {
    return this.machine.update(dto);
  }
}
