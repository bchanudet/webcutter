import { Module } from '@nestjs/common';
import { WorkspaceCheckController } from './workspace-check.controller';
import { WorkspaceCheckService } from './workspace-check.service';

@Module({
  controllers: [WorkspaceCheckController],
  providers: [WorkspaceCheckService],
})
export class WorkspaceCheckModule {}
