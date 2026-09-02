import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GcodeFileInfo, GcodeFileService } from './gcode-file.service';

@Controller('gcode-file')
export class GcodeFileController {
  constructor(private readonly gcodeFile: GcodeFileService) {}

  @Get()
  get(): GcodeFileInfo | null {
    return this.gcodeFile.get();
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File): GcodeFileInfo {
    if (!file) {
      throw new BadRequestException('Le champ "file" est requis.');
    }
    return this.gcodeFile.upload(file);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(): void {
    this.gcodeFile.delete();
  }
}
