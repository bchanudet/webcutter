import { Module } from '@nestjs/common';
import { CutterCommunicationService } from './cutter-communication.service';

@Module({
  controllers: [],
  providers: [CutterCommunicationService],
  exports: [CutterCommunicationService],
})
export class CutterCommunicationModule {}
