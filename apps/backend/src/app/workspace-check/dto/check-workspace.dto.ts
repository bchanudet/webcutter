import { IsString, MinLength } from 'class-validator';

export class CheckWorkspaceDto {
  @IsString()
  @MinLength(1)
  svg!: string;
}
