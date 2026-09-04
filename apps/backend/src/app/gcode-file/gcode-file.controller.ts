import { BadRequestException, Controller, Get, NotFoundException, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GcodeFileInfo } from '@webcutter/shared';
import { GcodeFileService } from './gcode-file.service';

/** Upload, plus reading the raw content for the Operation page's G-code viewer. Reading the
 * current file's *metadata* and deleting it are WebSocket messages instead (`gcodeFile` broadcast
 * / `deleteGcodeFile`, see `CutterGateway`), so every browser stays in sync the moment it changes —
 * but the raw text is only actually needed by whichever browser has the viewer tab open, and is
 * heavy enough (a whole program) that it doesn't belong in that broadcast. */
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

  @Get('content')
  getContent(): { content: string } {
    const content = this.gcodeFile.readContent();
    if (content == null) {
      throw new NotFoundException('No G-code file is currently uploaded.');
    }
    return { content };
  }
}
