import { Module } from '@nestjs/common';
import { FontController } from './font.controller';
import { FontService } from './font.service';

@Module({
  controllers: [FontController],
  providers: [FontService],
})
export class FontModule {}
