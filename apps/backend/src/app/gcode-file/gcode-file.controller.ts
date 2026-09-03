import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GcodeFileInfo, GcodeFileService } from './gcode-file.service';

/** Upload only — reading the current file's state and deleting it are WebSocket messages instead
 * (`gcodeFile` broadcast / `deleteGcodeFile`, see `CutterGateway`), so every browser looking at the
 * Operation page sees the same file and stays in sync the moment it changes. */
@Controller('gcode-file')
export class GcodeFileController {
  constructor(private readonly gcodeFile: GcodeFileService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File): GcodeFileInfo {
    if (!file) {
      throw new BadRequestException('The "file" field is required.');
    }
    return this.gcodeFile.upload(file);
  }
}
