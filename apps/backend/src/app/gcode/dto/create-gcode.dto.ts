import { IsEnum, IsInt, IsString, MaxLength, MinLength } from 'class-validator';
import { GcodeHook } from '../entities/gcode.entity';

export class CreateGcodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsEnum(GcodeHook)
  hook!: GcodeHook;

  @IsInt()
  order!: number;

  @IsString()
  code!: string;
}
