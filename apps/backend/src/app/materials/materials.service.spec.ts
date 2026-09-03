import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { MaterialsService } from './materials.service';
import { Material } from './entities/material.entity';

describe('MaterialsService', () => {
  let service: MaterialsService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn(),
      delete: jest.fn(),
    };
    service = new MaterialsService(repo as unknown as Repository<Material>);
  });

  it('lists materials with their profiles included, ordered by name', async () => {
    repo.find.mockResolvedValue([]);
    await service.findAll();
    expect(repo.find).toHaveBeenCalledWith({
      relations: { profiles: true },
      order: { name: 'ASC' },
    });
  });

  it('throws NotFoundException when a material does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOneOrThrow('missing-id')).rejects.toThrow(NotFoundException);
  });

  it('returns the material when it exists', async () => {
    const material = { id: 'material-1', name: 'Plywood', thicknessMm: 3, profiles: [] };
    repo.findOne.mockResolvedValue(material);
    await expect(service.findOneOrThrow('material-1')).resolves.toBe(material);
  });

  it('rejects updating a material that does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.update('missing-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('merges only the given fields when updating', async () => {
    const material = { id: 'material-1', name: 'Plywood', thicknessMm: 3, profiles: [] };
    repo.findOne.mockResolvedValue(material);
    repo.save.mockImplementation((m) => Promise.resolve(m));

    const updated = await service.update('material-1', { thicknessMm: 5 });

    expect(updated).toMatchObject({ name: 'Plywood', thicknessMm: 5 });
  });

  it('rejects deleting a material that does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.remove('missing-id')).rejects.toThrow(NotFoundException);
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
