import { IsString, MinLength } from 'class-validator';

/** Body shared by both `POST /workspace/check` and `POST /workspace/generate` — a workspace SVG
 * in the format documented in docs/workspace-svg-format.md. */
export class WorkspaceSvgDto {
  @IsString()
  @MinLength(1)
  svg!: string;
}
