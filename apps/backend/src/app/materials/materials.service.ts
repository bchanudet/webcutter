import { Injectable, NotFoundException } from '@nestjs/common';
import { Material } from '@webcutter/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.material.findMany({
      include: { profiles: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOneOrThrow(id: number) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: { profiles: true },
    });
    if (!material) {
      throw new NotFoundException(`Material ${id} not found.`);
    }
    return material;
  }

  create(dto: CreateMaterialDto): Promise<Material> {
    return this.prisma.material.create({ data: dto });
  }

  async update(id: number, dto: UpdateMaterialDto): Promise<Material> {
    await this.findOneOrThrow(id);
    return this.prisma.material.update({ where: { id }, data: dto });
  }

  async remove(id: number): Promise<void> {
    await this.findOneOrThrow(id);
    await this.prisma.material.delete({ where: { id } });
  }
}
