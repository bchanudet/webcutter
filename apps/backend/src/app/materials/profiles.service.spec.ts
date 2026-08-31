import { NotFoundException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { MaterialsService } from './materials.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let prisma: {
    profile: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
  };
  let materials: { findOneOrThrow: jest.Mock };

  const baseDto: CreateProfileDto = {
    name: 'Cut',
    color: '#ff0000',
    mode: 'LINE' as CreateProfileDto['mode'],
    powerPercent: 80,
    speedMmPerSec: 15,
  };

  beforeEach(() => {
    prisma = {
      profile: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    materials = { findOneOrThrow: jest.fn().mockResolvedValue({ id: 1 }) };
    service = new ProfilesService(
      prisma as unknown as PrismaService,
      materials as unknown as MaterialsService,
    );
  });

  it('defaults passes to 1 when not provided on create', async () => {
    prisma.profile.create.mockResolvedValue({});
    await service.create(1, baseDto);
    expect(prisma.profile.create).toHaveBeenCalledWith({
      data: { ...baseDto, passes: 1, materialId: 1 },
    });
  });

  it('keeps the given passes value on create', async () => {
    prisma.profile.create.mockResolvedValue({});
    await service.create(1, { ...baseDto, passes: 5 });
    expect(prisma.profile.create).toHaveBeenCalledWith({
      data: { ...baseDto, passes: 5, materialId: 1 },
    });
  });

  it('rejects creating a profile for a material that does not exist', async () => {
    materials.findOneOrThrow.mockRejectedValue(new NotFoundException());
    await expect(service.create(42, baseDto)).rejects.toThrow(NotFoundException);
    expect(prisma.profile.create).not.toHaveBeenCalled();
  });

  it('does not inject a passes value on partial update (would silently overwrite it)', async () => {
    prisma.profile.findUnique.mockResolvedValue({ id: 1 });
    prisma.profile.update.mockResolvedValue({});
    await service.update(1, { powerPercent: 95 });
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { powerPercent: 95 },
    });
  });

  it('rejects updating a profile that does not exist', async () => {
    prisma.profile.findUnique.mockResolvedValue(null);
    await expect(service.update(42, { powerPercent: 1 })).rejects.toThrow(NotFoundException);
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });

  it('rejects deleting a profile that does not exist', async () => {
    prisma.profile.findUnique.mockResolvedValue(null);
    await expect(service.remove(42)).rejects.toThrow(NotFoundException);
    expect(prisma.profile.delete).not.toHaveBeenCalled();
  });
});
