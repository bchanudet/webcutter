import { Module } from '@nestjs/common';
import { CutterCommunicationModule } from '@webcutter/cutter-communication';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CutterController } from './cutter/cutter.controller';

@Module({
  imports: [CutterCommunicationModule],
  controllers: [AppController, CutterController],
  providers: [AppService],
})
export class AppModule {}
