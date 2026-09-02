import { Module } from '@nestjs/common';
import { GcodeModule } from '../gcode/gcode.module';
import { MachineModule } from '../machine/machine.module';
import { WorkspaceCheckController } from './workspace-check.controller';
import { WorkspaceCheckService } from './workspace-check.service';
import { WorkspaceGenerateController } from './workspace-generate.controller';
import { WorkspaceGcodeGeneratorService } from './workspace-gcode-generator.service';

@Module({
  imports: [MachineModule, GcodeModule],
  controllers: [WorkspaceCheckController, WorkspaceGenerateController],
  providers: [WorkspaceCheckService, WorkspaceGcodeGeneratorService],
})
export class WorkspaceModule {}
