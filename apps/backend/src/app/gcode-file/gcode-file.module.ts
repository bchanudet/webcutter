import { Module } from '@nestjs/common';
import { GcodeFileController } from './gcode-file.controller';
import { GcodeFileService } from './gcode-file.service';

@Module({
  controllers: [GcodeFileController],
  providers: [GcodeFileService],
})
export class GcodeFileModule {}
