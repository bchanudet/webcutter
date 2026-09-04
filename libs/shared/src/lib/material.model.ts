import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export enum ProfileMode {
  LINE = 'LINE',
  FILL = 'FILL',
}

/** Body for `POST /materials` — also used directly as the frontend's payload type for the same
 * request. `PATCH /materials/:id` accepts the same shape, made partial by the backend's
 * `UpdateMaterialDto`. */
export class CreateMaterialDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumber()
  @Min(0)
  thicknessMm!: number;
}

/** Body for `POST /materials/:materialId/profiles` — also used directly as the frontend's payload
 * type for the same request. `PATCH /profiles/:id` accepts the same shape, made partial by the
 * backend's `UpdateProfileDto`. */
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
  lineSpacingMm?: number | null;
}

/** Read shape of the backend's `Profile` TypeORM entity, as returned by the materials/profiles
 * endpoints — the frontend's type for profile data everywhere it isn't editing it. */
export interface Profile {
  id: string;
  materialId: string;
  name: string;
  color: string;
  mode: ProfileMode;
  powerPercent: number;
  speedMmPerMin: number;
  passes: number;
  lineSpacingMm: number | null;
}

/** Read shape of the backend's `Material` TypeORM entity, as returned by the materials endpoints —
 * the frontend's type for material data everywhere it isn't editing it. */
export interface Material {
  id: string;
  name: string;
  thicknessMm: number;
  profiles: Profile[];
}
