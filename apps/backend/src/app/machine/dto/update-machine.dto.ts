import { IsBoolean, IsEnum, IsInt, IsNumber, IsString, Min, MinLength } from 'class-validator';
import { GcodeOrigin, SerialParity } from '../entities/machine.entity';

export class UpdateMachineDto {
  @IsNumber()
  @Min(1)
  bedWidthMm!: number;

  @IsNumber()
  @Min(1)
  bedHeightMm!: number;

  @IsString()
  @MinLength(1)
  serialPortPath!: string;

  @IsInt()
  @Min(1)
  baudRate!: number;

  @IsInt()
  @Min(5)
  dataBits!: number;

  @IsInt()
  @Min(1)
  stopBits!: number;

  @IsEnum(SerialParity)
  parity!: SerialParity;

  @IsBoolean()
  mirrorX!: boolean;

  @IsBoolean()
  mirrorY!: boolean;

  @IsEnum(GcodeOrigin)
  origin!: GcodeOrigin;

  @IsNumber()
  @Min(0)
  maxAccelerationXMmPerSec2!: number;

  @IsNumber()
  @Min(0)
  maxAccelerationYMmPerSec2!: number;

  @IsNumber()
  @Min(0)
  maxSpeedXMmPerSec!: number;

  @IsNumber()
  @Min(0)
  maxSpeedYMmPerSec!: number;

  @IsInt()
  @Min(1)
  sMax!: number;
}
