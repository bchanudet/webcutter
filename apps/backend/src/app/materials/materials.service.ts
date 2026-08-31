import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Material } from './entities/material.entity';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

@Injectable()
export class MaterialsService {
  constructor(@InjectRepository(Material) private readonly materials: Repository<Material>) {}

  findAll(): Promise<Material[]> {
    return this.materials.find({ relations: { profiles: true }, order: { name: 'ASC' } });
  }

  async findOneOrThrow(id: number): Promise<Material> {
    const material = await this.materials.findOne({
      where: { id },
      relations: { profiles: true },
    });
    if (!material) {
      throw new NotFoundException(`Material ${id} not found.`);
    }
    return material;
  }

  create(dto: CreateMaterialDto): Promise<Material> {
    return this.materials.save(this.materials.create(dto));
  }

  async update(id: number, dto: UpdateMaterialDto): Promise<Material> {
    const material = await this.findOneOrThrow(id);
    Object.assign(material, dto);
    return this.materials.save(material);
  }

  async remove(id: number): Promise<void> {
    await this.findOneOrThrow(id);
    await this.materials.delete(id);
  }
}
