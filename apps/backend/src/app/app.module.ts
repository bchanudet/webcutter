import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CutterCommunicationModule } from '@webcutter/cutter-communication';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CutterController } from './cutter/cutter.controller';
import { CutterGateway } from './cutter/cutter.gateway';
import { GcodeModule } from './gcode/gcode.module';
import { MachineModule } from './machine/machine.module';
import { MaterialsModule } from './materials/materials.module';
import { WorkspaceCheckModule } from './workspace-check/workspace-check.module';

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
    WorkspaceCheckModule,
  ],
  controllers: [AppController, CutterController],
  providers: [AppService, CutterGateway],
})
export class AppModule {}
