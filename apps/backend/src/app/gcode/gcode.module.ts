import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Gcode } from './entities/gcode.entity';
import { GcodeController } from './gcode.controller';
import { GcodeService } from './gcode.service';

@Module({
  imports: [TypeOrmModule.forFeature([Gcode])],
  controllers: [GcodeController],
  providers: [GcodeService],
  exports: [GcodeService],
})
export class GcodeModule {}
