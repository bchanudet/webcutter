import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { GcodeService } from './gcode.service';
import { Gcode, GcodeHook } from './entities/gcode.entity';

describe('GcodeService', () => {
  let service: GcodeService;
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
    service = new GcodeService(repo as unknown as Repository<Gcode>);
  });

  it('lists gcodes ordered by hook then order', async () => {
    repo.find.mockResolvedValue([]);
    await service.findAll();
    expect(repo.find).toHaveBeenCalledWith({ order: { hook: 'ASC', order: 'ASC' } });
  });

  it('throws NotFoundException when a gcode does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOneOrThrow(42)).rejects.toThrow(NotFoundException);
  });

  it('returns the gcode when it exists', async () => {
    const gcode = { id: 1, name: 'Fumes extractor on', hook: GcodeHook.START, order: 0, code: 'M8' };
    repo.findOne.mockResolvedValue(gcode);
    await expect(service.findOneOrThrow(1)).resolves.toBe(gcode);
  });

  it('rejects updating a gcode that does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.update(42, { name: 'X' })).rejects.toThrow(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('merges only the given fields when updating', async () => {
    const gcode = { id: 1, name: 'Fumes extractor on', hook: GcodeHook.START, order: 0, code: 'M8' };
    repo.findOne.mockResolvedValue(gcode);
    repo.save.mockImplementation((g) => Promise.resolve(g));

    const updated = await service.update(1, { order: 5 });

    expect(updated).toMatchObject({ name: 'Fumes extractor on', order: 5 });
  });

  it('rejects deleting a gcode that does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.remove(42)).rejects.toThrow(NotFoundException);
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
