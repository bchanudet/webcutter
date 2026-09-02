import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { WorkspaceSvgDto } from './dto/workspace-svg.dto';
import { WorkspaceCheckError, WorkspaceCheckService } from './workspace-check.service';

@Controller('workspace')
export class WorkspaceCheckController {
  constructor(private readonly workspaceCheck: WorkspaceCheckService) {}

  @Post('check')
  check(@Body() dto: WorkspaceSvgDto): { errors: WorkspaceCheckError[] } {
    try {
      return { errors: this.workspaceCheck.check(dto.svg) };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Le SVG fourni est invalide.');
    }
  }
}
