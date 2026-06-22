import { Controller, Get, Req } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../auth/auth.types';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  getMyReservations(@Req() req: AuthenticatedRequest) {
    return this.prisma.reservation.findMany({
      where: { userId: req.userId! },
      include: { seat: true },
      orderBy: { reservedAt: 'desc' },
    });
  }
}
