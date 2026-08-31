import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  controllers: [MaterialsController, ProfilesController],
  providers: [MaterialsService, ProfilesService],
})
export class MaterialsModule {}
