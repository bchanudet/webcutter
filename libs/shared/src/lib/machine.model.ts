import { IsBoolean, IsEnum, IsInt, IsNumber, IsString, Min, MinLength } from 'class-validator';

// SQLite has no native enum column type, so the parity is stored as varchar (see ProfileMode for
// precedent, in ./material.model.ts).
export enum SerialParity {
  NONE = 'none',
  EVEN = 'even',
  ODD = 'odd',
}

// Numeric values match the origin corner convention used by the G-code generator.
export enum GcodeOrigin {
  BOTTOM_LEFT = 0,
  TOP_LEFT = 1,
  TOP_RIGHT = 2,
  BOTTOM_RIGHT = 4,
  CENTER = 5,
}

/** Body for `PUT /machine` (see the backend's `MachineController`) — also used directly as the
 * frontend's payload type for the same request, since the shape is identical either side. */
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

/** Read shape of the backend's `Machine` TypeORM entity, as returned by `GET /machine` and
 * serialized to JSON — the frontend's type for machine data everywhere it isn't editing it. */
export interface Machine {
  id: number;
  name: string;
  bedWidthMm: number;
  bedHeightMm: number;
  serialPortPath: string;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: SerialParity;
  mirrorX: boolean;
  mirrorY: boolean;
  origin: GcodeOrigin;
  offsetXMm: number;
  offsetYMm: number;
  maxAccelerationXMmPerSec2: number;
  maxAccelerationYMmPerSec2: number;
  maxSpeedXMmPerMin: number;
  maxSpeedYMmPerMin: number;
  travelSpeedXMmPerMin: number;
  travelSpeedYMmPerMin: number;
  sMax: number;
}
