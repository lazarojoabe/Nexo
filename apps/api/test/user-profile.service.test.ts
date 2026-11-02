import { describe, expect, it, vi } from 'vitest';
import { UserProfileService } from '../src/user-profile.service';

describe('UserProfileService', () => {
  it('conclui quando outro pedido cria o mesmo perfil durante o upsert', async () => {
    const prisma = {
      enabled: true,
      userProfile: {
        upsert: vi.fn().mockRejectedValue({ code: 'P2002' }),
        update: vi.fn().mockResolvedValue({ id: 'user-1' }),
      },
    };

    await expect(new UserProfileService(prisma as never).ensure({ id: 'user-1', displayName: 'Lazar' })).resolves.toBeUndefined();

    expect(prisma.userProfile.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { displayName: 'Lazar' } });
  });

  it('propaga uma falha que não seja conflito de unicidade', async () => {
    const failure = new Error('database unavailable');
    const prisma = { enabled: true, userProfile: { upsert: vi.fn().mockRejectedValue(failure), update: vi.fn() } };

    await expect(new UserProfileService(prisma as never).ensure({ id: 'user-1' })).rejects.toBe(failure);
    expect(prisma.userProfile.update).not.toHaveBeenCalled();
  });
});
