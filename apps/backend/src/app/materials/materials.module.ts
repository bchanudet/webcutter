import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Material } from './entities/material.entity';
import { Profile } from './entities/profile.entity';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [TypeOrmModule.forFeature([Material, Profile])],
  controllers: [MaterialsController, ProfilesController],
  providers: [MaterialsService, ProfilesService],
})
export class MaterialsModule {}
