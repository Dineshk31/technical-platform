import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import type { ExternalIdentity } from '@technical-platform/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { IdentityProvider } from '../interfaces/identity-provider.interface.js';

@Injectable()
export class LocalIdentityProvider implements IdentityProvider {
  constructor(private readonly prisma: PrismaService) {}

  async validateCredentials(email: string, password: string): Promise<ExternalIdentity | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { role: true },
    });

    if (!user || !user.isActive || !user.passwordHash) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    return {
      externalId: user.externalId ?? user.id,
      email: user.email,
      name: user.name,
      role: user.role.code,
      department: user.department,
      batch: user.batch,
    };
  }
}
