import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from './auth-identity.service';
import { PrismaService } from './prisma.service';

/** Stores only the non-sensitive fields the application itself needs. */
@Injectable()
export class UserProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(user: AuthenticatedUser) {
    if (!this.prisma.enabled) return;
    const data = user.displayName ? { displayName: user.displayName } : {};
    try {
      await this.prisma.userProfile.upsert({
        where: { id: user.id },
        update: data,
        create: { id: user.id, ...data },
      });
    } catch (error) {
      // Prisma can implement an upsert as a read followed by an insert. When
      // two authenticated endpoints arrive together, one insert wins and the
      // other receives P2002 even though the desired profile now exists.
      if (!isUniqueIdConflict(error)) throw error;
      await this.prisma.userProfile.update({ where: { id: user.id }, data });
    }
  }
}

function isUniqueIdConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}
