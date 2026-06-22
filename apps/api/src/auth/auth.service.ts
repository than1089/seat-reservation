import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '../generated/prisma/client';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertUser(clerkUserId: string, email: string): Promise<User> {
    return this.prisma.user.upsert({
      where: { clerkUserId },
      update: { email },
      create: { clerkUserId, email },
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        _count: { select: { reservations: true } },
      },
    });

    return {
      id: user.id,
      email: user.email,
      reservationCount: user._count.reservations,
    };
  }
}
