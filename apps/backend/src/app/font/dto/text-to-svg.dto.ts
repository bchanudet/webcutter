import { IsNumber, IsOptional, IsPositive, IsString, Matches } from 'class-validator';

/** Body for `POST /font/text-to-svg` — a single line of text to render using the bundled font
 * glyphs (see `FontService`). */
export class TextToSvgDto {
  @IsString()
  @Matches(/^[^\r\n]*$/, { message: 'text must be a single line (no line breaks).' })
  text!: string;

  /** Desired rendered height of the text, in millimeters — defaults to `FontService`'s own
   * default (10mm) when omitted. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  heightMm?: number;
}
