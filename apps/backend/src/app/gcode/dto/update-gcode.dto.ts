import { PartialType } from '@nestjs/mapped-types';
import { CreateGcodeDto } from './create-gcode.dto';

export class UpdateGcodeDto extends PartialType(CreateGcodeDto) {}
