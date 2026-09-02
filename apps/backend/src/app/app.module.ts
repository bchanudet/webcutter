import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CutterCommunicationModule } from '@webcutter/cutter-communication';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CutterController } from './cutter/cutter.controller';
import { CutterGateway } from './cutter/cutter.gateway';
import { GcodeFileModule } from './gcode-file/gcode-file.module';
import { GcodeModule } from './gcode/gcode.module';
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
    WorkspaceModule,
  ],
  controllers: [AppController, CutterController],
  providers: [AppService, CutterGateway],
})
export class AppModule {}
