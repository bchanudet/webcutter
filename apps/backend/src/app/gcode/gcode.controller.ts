import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { GcodeService } from './gcode.service';
import { CreateGcodeDto } from './dto/create-gcode.dto';
import { UpdateGcodeDto } from './dto/update-gcode.dto';

@Controller('gcodes')
export class GcodeController {
  constructor(private readonly gcodes: GcodeService) {}

  @Get()
  findAll() {
    return this.gcodes.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.gcodes.findOneOrThrow(id);
  }

  @Post()
  create(@Body() dto: CreateGcodeDto) {
    return this.gcodes.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGcodeDto) {
    return this.gcodes.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.gcodes.remove(id);
  }
}
