import { Module } from '@nestjs/common';
import { GcodeFileModule } from '../gcode-file/gcode-file.module';
import { GcodeModule } from '../gcode/gcode.module';
import { MachineModule } from '../machine/machine.module';
import { WorkspaceCheckController } from './workspace-check.controller';
import { WorkspaceCheckService } from './workspace-check.service';
import { WorkspaceGenerateController } from './workspace-generate.controller';
import { WorkspaceGcodeGeneratorService } from './workspace-gcode-generator.service';
import { WorkspaceSendToOperationController } from './workspace-send-to-operation.controller';

@Module({
  imports: [MachineModule, GcodeModule, GcodeFileModule],
  controllers: [WorkspaceCheckController, WorkspaceGenerateController, WorkspaceSendToOperationController],
  providers: [WorkspaceCheckService, WorkspaceGcodeGeneratorService],
})
export class WorkspaceModule {}
