import { IsEnum, IsInt, IsString, MaxLength, MinLength } from 'class-validator';

export enum GcodeHook {
  START = 'start',
  END = 'end',
}

/** Body for `POST /gcodes` — also used directly as the frontend's payload type for the same
 * request. `PATCH /gcodes/:id` accepts the same shape, made partial by the backend's
 * `UpdateGcodeDto`. */
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

/** Read shape of the backend's `Gcode` TypeORM entity, as returned by `GET /gcodes` — the
 * frontend's type for custom G-code block data everywhere it isn't editing it. */
export interface Gcode {
  id: number;
  name: string;
  hook: GcodeHook;
  order: number;
  code: string;
}
