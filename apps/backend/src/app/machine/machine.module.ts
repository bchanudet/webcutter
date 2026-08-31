import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Machine } from './entities/machine.entity';
import { MachineController } from './machine.controller';
import { MachineService } from './machine.service';

@Module({
  imports: [TypeOrmModule.forFeature([Machine])],
  controllers: [MachineController],
  providers: [MachineService],
})
export class MachineModule {}
