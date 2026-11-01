import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from './auth-identity.service';
import { PrismaService } from './prisma.service';

/** Stores only the non-sensitive fields the application itself needs. */
@Injectable()
export class UserProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(user: AuthenticatedUser) {
    if (!this.prisma.enabled) return;
    await this.prisma.userProfile.upsert({
      where: { id: user.id },
      update: user.displayName ? { displayName: user.displayName } : {},
      create: { id: user.id, ...(user.displayName ? { displayName: user.displayName } : {}) },
    });
  }
}
