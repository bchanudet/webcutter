import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProfilesService } from './profiles.service';
import { MaterialsService } from './materials.service';
import { Profile, ProfileMode } from './entities/profile.entity';
import { CreateProfileDto } from './dto/create-profile.dto';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let materials: { findOneOrThrow: jest.Mock };

  const baseDto: CreateProfileDto = {
    name: 'Cut',
    color: '#ff0000',
    mode: ProfileMode.LINE,
    powerPercent: 80,
    speedMmPerMin: 900,
  };

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve(entity)),
      delete: jest.fn(),
    };
    materials = { findOneOrThrow: jest.fn().mockResolvedValue({ id: 'material-1' }) };
    service = new ProfilesService(
      repo as unknown as Repository<Profile>,
      materials as unknown as MaterialsService,
    );
  });

  it('defaults passes to 1 when not provided on create', async () => {
    await service.create('material-1', baseDto);
    expect(repo.create).toHaveBeenCalledWith({ ...baseDto, passes: 1, materialId: 'material-1' });
  });

  it('keeps the given passes value on create', async () => {
    await service.create('material-1', { ...baseDto, passes: 5 });
    expect(repo.create).toHaveBeenCalledWith({ ...baseDto, passes: 5, materialId: 'material-1' });
  });

  it('rejects creating a profile for a material that does not exist', async () => {
    materials.findOneOrThrow.mockRejectedValue(new NotFoundException());
    await expect(service.create('missing-material', baseDto)).rejects.toThrow(NotFoundException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('does not inject a passes value on partial update (would silently overwrite it)', async () => {
    const profile = { id: 'profile-1', ...baseDto, passes: 3, materialId: 'material-1' };
    repo.findOne.mockResolvedValue(profile);

    const updated = await service.update('profile-1', { powerPercent: 95 });

    expect(updated).toMatchObject({ powerPercent: 95, passes: 3 });
  });

  it('rejects updating a profile that does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.update('missing-profile', { powerPercent: 1 })).rejects.toThrow(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects deleting a profile that does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.remove('missing-profile')).rejects.toThrow(NotFoundException);
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
