import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { GcodeFileInfo, GcodeFileService } from '../gcode-file/gcode-file.service';
import { WorkspaceSvgDto } from './dto/workspace-svg.dto';
import { WorkspaceCheckError } from './workspace-check.service';
import { WorkspaceGcodeGeneratorService } from './workspace-gcode-generator.service';

const GENERATED_FILE_NAME = 'workspace.gcode';

export interface WorkspaceSendToOperationResult {
  errors: WorkspaceCheckError[];
  /** `null` whenever `errors` isn't empty — nothing is stored for a workspace that fails a check. */
  file: GcodeFileInfo | null;
}

@Controller('workspace')
export class WorkspaceSendToOperationController {
  constructor(
    private readonly generator: WorkspaceGcodeGeneratorService,
    private readonly gcodeFile: GcodeFileService,
  ) {}

  /** Generates g-code from a workspace SVG and stores it as the current Operation g-code file —
   * entirely server-side, so the browser never has to download the g-code just to immediately
   * re-upload it. Storing it through `GcodeFileService` triggers the exact same WebSocket
   * broadcast (`CutterGateway` listening for its 'changed' event) as a real file upload, so every
   * browser on the Operation page picks it up the same way. */
  @Post('send-to-operation')
  async sendToOperation(@Body() dto: WorkspaceSvgDto): Promise<WorkspaceSendToOperationResult> {
    try {
      const result = await this.generator.generate(dto.svg);
      if (result.errors.length > 0 || !result.gcode) {
        return { errors: result.errors, file: null };
      }

      const file = this.gcodeFile.save(result.gcode, GENERATED_FILE_NAME);
      return { errors: [], file };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Le SVG fourni est invalide.');
    }
  }
}
