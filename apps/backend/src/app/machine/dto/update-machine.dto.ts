import { IsBoolean, IsEnum, IsInt, IsNumber, IsString, Min, MinLength } from 'class-validator';
import { GcodeOrigin, SerialParity } from '../entities/machine.entity';

export class UpdateMachineDto {
  @IsString()
  @MinLength(1)
  name!: string;

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
  offsetXMm!: number;

  @IsNumber()
  offsetYMm!: number;

  @IsNumber()
  @Min(0)
  maxAccelerationXMmPerSec2!: number;

  @IsNumber()
  @Min(0)
  maxAccelerationYMmPerSec2!: number;

  @IsNumber()
  @Min(0)
  maxSpeedXMmPerMin!: number;

  @IsNumber()
  @Min(0)
  maxSpeedYMmPerMin!: number;

  @IsNumber()
  @Min(0)
  travelSpeedXMmPerMin!: number;

  @IsNumber()
  @Min(0)
  travelSpeedYMmPerMin!: number;

  @IsInt()
  @Min(1)
  sMax!: number;
}
