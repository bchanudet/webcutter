import { NotFoundException } from '@nestjs/common';
import { MaterialsService } from './materials.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MaterialsService', () => {
  let service: MaterialsService;
  let prisma: {
    material: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      material: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new MaterialsService(prisma as unknown as PrismaService);
  });

  it('lists materials with their profiles included, ordered by name', async () => {
    prisma.material.findMany.mockResolvedValue([]);
    await service.findAll();
    expect(prisma.material.findMany).toHaveBeenCalledWith({
      include: { profiles: true },
      orderBy: { name: 'asc' },
    });
  });

  it('throws NotFoundException when a material does not exist', async () => {
    prisma.material.findUnique.mockResolvedValue(null);
    await expect(service.findOneOrThrow(42)).rejects.toThrow(NotFoundException);
  });

  it('returns the material when it exists', async () => {
    const material = { id: 1, name: 'Plywood', thicknessMm: 3, profiles: [] };
    prisma.material.findUnique.mockResolvedValue(material);
    await expect(service.findOneOrThrow(1)).resolves.toBe(material);
  });

  it('rejects updating a material that does not exist', async () => {
    prisma.material.findUnique.mockResolvedValue(null);
    await expect(service.update(42, { name: 'X' })).rejects.toThrow(NotFoundException);
    expect(prisma.material.update).not.toHaveBeenCalled();
  });

  it('rejects deleting a material that does not exist', async () => {
    prisma.material.findUnique.mockResolvedValue(null);
    await expect(service.remove(42)).rejects.toThrow(NotFoundException);
    expect(prisma.material.delete).not.toHaveBeenCalled();
  });
});
