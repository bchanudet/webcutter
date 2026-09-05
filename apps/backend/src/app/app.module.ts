import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CutterCommunicationModule } from '@webcutter/cutter-communication';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AutoConnectService } from './cutter/auto-connect.service';
import { CheckService } from './cutter/check.service';
import { CutterController } from './cutter/cutter.controller';
import { CutterGateway } from './cutter/cutter.gateway';
import { FramingService } from './cutter/framing.service';
import { FontModule } from './font/font.module';
import { GcodeFileModule } from './gcode-file/gcode-file.module';
import { GcodeModule } from './gcode/gcode.module';
import { HistoryModule } from './history/history.module';
import { JobService } from './cutter/job.service';
import { MachineModule } from './machine/machine.module';
import { MaterialsModule } from './materials/materials.module';
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'dev.db',
      autoLoadEntities: true,
      synchronize: true,
    }),
    CutterCommunicationModule,
    MaterialsModule,
    MachineModule,
    GcodeModule,
    GcodeFileModule,
    HistoryModule,
    WorkspaceModule,
    FontModule,
  ],
  controllers: [AppController, CutterController],
  providers: [AppService, CutterGateway, FramingService, CheckService, JobService, AutoConnectService],
})
export class AppModule {}
