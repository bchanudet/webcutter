import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './entities/profile.entity';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MaterialsService } from './materials.service';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    private readonly materials: MaterialsService,
  ) {}

  private async findOneOrThrow(id: number): Promise<Profile> {
    const profile = await this.profiles.findOne({ where: { id } });
    if (!profile) {
      throw new NotFoundException(`Profile ${id} not found.`);
    }
    return profile;
  }

  async create(materialId: number, dto: CreateProfileDto): Promise<Profile> {
    await this.materials.findOneOrThrow(materialId);
    const profile = this.profiles.create({ ...dto, passes: dto.passes ?? 1, materialId });
    return this.profiles.save(profile);
  }

  async update(id: number, dto: UpdateProfileDto): Promise<Profile> {
    const profile = await this.findOneOrThrow(id);
    Object.assign(profile, dto);
    return this.profiles.save(profile);
  }

  async remove(id: number): Promise<void> {
    await this.findOneOrThrow(id);
    await this.profiles.delete(id);
  }
}
