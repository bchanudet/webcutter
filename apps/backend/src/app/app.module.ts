import { Module } from '@nestjs/common';
import { CutterCommunicationModule } from '@webcutter/cutter-communication';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CutterController } from './cutter/cutter.controller';
import { MaterialsModule } from './materials/materials.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, CutterCommunicationModule, MaterialsModule],
  controllers: [AppController, CutterController],
  providers: [AppService],
})
export class AppModule {}
