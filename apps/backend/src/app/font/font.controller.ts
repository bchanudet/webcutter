import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { TextToSvgDto } from './dto/text-to-svg.dto';
import { FontService } from './font.service';

@Controller('font')
export class FontController {
  constructor(private readonly font: FontService) {}

  @Post('text-to-svg')
  textToSvg(@Body() dto: TextToSvgDto): { svg: string } {
    try {
      return { svg: this.font.renderText(dto.text, dto.heightMm) };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Text rendering failed.');
    }
  }
}
