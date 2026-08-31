import { Injectable, NotFoundException } from '@nestjs/common';
import { Profile } from '@webcutter/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MaterialsService } from './materials.service';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly materials: MaterialsService,
  ) {}

  private async findOneOrThrow(id: number) {
    const profile = await this.prisma.profile.findUnique({ where: { id } });
    if (!profile) {
      throw new NotFoundException(`Profile ${id} not found.`);
    }
    return profile;
  }

  async create(materialId: number, dto: CreateProfileDto): Promise<Profile> {
    await this.materials.findOneOrThrow(materialId);
    return this.prisma.profile.create({
      data: { ...dto, passes: dto.passes ?? 1, materialId },
    });
  }

  async update(id: number, dto: UpdateProfileDto): Promise<Profile> {
    await this.findOneOrThrow(id);
    return this.prisma.profile.update({ where: { id }, data: dto });
  }

  async remove(id: number): Promise<void> {
    await this.findOneOrThrow(id);
    await this.prisma.profile.delete({ where: { id } });
  }
}
