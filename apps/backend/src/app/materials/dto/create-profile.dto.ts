import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ProfileMode } from '../entities/profile.entity';

export class CreateProfileDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  color!: string;

  @IsEnum(ProfileMode)
  mode!: ProfileMode;

  @IsNumber()
  @Min(0)
  powerPercent!: number;

  @IsNumber()
  @Min(0)
  speedMmPerMin!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  passes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lineSpacingMm?: number;
}
