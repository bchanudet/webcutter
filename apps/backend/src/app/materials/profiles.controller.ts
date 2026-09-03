import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller()
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Post('materials/:materialId/profiles')
  create(@Param('materialId', ParseUUIDPipe) materialId: string, @Body() dto: CreateProfileDto) {
    return this.profiles.create(materialId, dto);
  }

  @Patch('profiles/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProfileDto) {
    return this.profiles.update(id, dto);
  }

  @Delete('profiles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.profiles.remove(id);
  }
}
