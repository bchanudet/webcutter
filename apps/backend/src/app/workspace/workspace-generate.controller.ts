import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { WorkspaceSvgDto } from './dto/workspace-svg.dto';
import { WorkspaceGcodeGeneratorService, WorkspaceGenerateResult } from './workspace-gcode-generator.service';

@Controller('workspace')
export class WorkspaceGenerateController {
  constructor(private readonly generator: WorkspaceGcodeGeneratorService) {}

  @Post('generate')
  async generate(@Body() dto: WorkspaceSvgDto): Promise<WorkspaceGenerateResult> {
    try {
      return await this.generator.generate(dto.svg);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Le SVG fourni est invalide.');
    }
  }
}
