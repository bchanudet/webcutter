import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CutterCommunicationModule } from '@webcutter/cutter-communication';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CutterController } from './cutter/cutter.controller';
import { GcodeModule } from './gcode/gcode.module';
import { MachineModule } from './machine/machine.module';
import { MaterialsModule } from './materials/materials.module';

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
  ],
  controllers: [AppController, CutterController],
  providers: [AppService],
})
export class AppModule {}
