import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SeatStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  HOLD_DURATION_MS,
  isHoldExpired,
  LockedSeatRow,
} from './seats.constants';

@Injectable()
export class SeatsService {
  constructor(private readonly prisma: PrismaService) {}

  async listSeats(userId?: string) {
    const seats = await this.prisma.seat.findMany({
      orderBy: { number: 'asc' },
    });

    return seats.map((seat) => ({
      id: seat.id,
      number: seat.number,
      amountCents: seat.amountCents,
      status: this.effectiveStatus(seat),
      isHeldByCurrentUser: userId ? seat.heldByUserId === userId : false,
      holdExpiresAt: seat.holdExpiresAt,
    }));
  }

  async holdSeat(seatId: string, userId: string) {
    // Wrap read + write in one transaction so the row lock spans the full decision.
    return this.prisma.$transaction(async (tx) => {
      // Pessimistic lock: concurrent hold attempts on this seat block here until
      // the current transaction commits. Only one winner can read and update at a time.
      const rows = await tx.$queryRaw<LockedSeatRow[]>`
        SELECT id, number, status, "holdExpiresAt", "heldByUserId", version
        FROM "Seat"
        WHERE id = ${seatId}
        FOR UPDATE
      `;

      const seat = rows[0];
      if (!seat) {
        throw new NotFoundException('Seat not found');
      }

      // Evaluate status while the lock is held so we don't race with another hold/payment.
      const effectiveStatus = this.effectiveStatus(seat);

      if (effectiveStatus === SeatStatus.RESERVED) {
        throw new ConflictException('Seat is already reserved');
      }

      if (
        effectiveStatus === SeatStatus.HELD &&
        seat.heldByUserId !== userId
      ) {
        throw new ConflictException('Seat just taken');
      }

      const holdExpiresAt = new Date(Date.now() + HOLD_DURATION_MS);

      // Lock is released when the transaction commits; version tracks each state change.
      const updated = await tx.seat.update({
        where: { id: seatId },
        data: {
          status: SeatStatus.HELD,
          heldByUserId: userId,
          holdExpiresAt,
          version: { increment: 1 },
        },
      });

      return {
        id: updated.id,
        number: updated.number,
        status: updated.status,
        holdExpiresAt: updated.holdExpiresAt,
      };
    });
  }

  async releaseHold(seatId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Same pattern as holdSeat: lock the row first, then validate and update.
      const rows = await tx.$queryRaw<LockedSeatRow[]>`
        SELECT id, number, status, "holdExpiresAt", "heldByUserId", version
        FROM "Seat"
        WHERE id = ${seatId}
        FOR UPDATE
      `;

      const seat = rows[0];
      if (!seat) {
        throw new NotFoundException('Seat not found');
      }

      // Only the current holder can release; prevents clearing someone else's hold.
      if (seat.heldByUserId !== userId) {
        throw new ConflictException('You do not hold this seat');
      }

      if (seat.status === SeatStatus.RESERVED) {
        throw new ConflictException('Seat is already reserved');
      }

      await tx.seat.update({
        where: { id: seatId },
        data: {
          status: SeatStatus.AVAILABLE,
          heldByUserId: null,
          holdExpiresAt: null,
          version: { increment: 1 },
        },
      });

      return { released: true };
    });
  }

  async assertValidHold(seatId: string, userId: string) {
    const seat = await this.prisma.seat.findUnique({ where: { id: seatId } });

    if (!seat) {
      throw new NotFoundException('Seat not found');
    }

    if (seat.status === SeatStatus.RESERVED) {
      throw new ConflictException('Seat is already reserved');
    }

    if (
      seat.status !== SeatStatus.HELD ||
      seat.heldByUserId !== userId ||
      isHoldExpired(seat.holdExpiresAt)
    ) {
      throw new GoneException('Seat hold expired or invalid');
    }

    return seat;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async releaseExpiredHolds() {
    await this.prisma.seat.updateMany({
      where: {
        status: SeatStatus.HELD,
        holdExpiresAt: { lt: new Date() },
      },
      data: {
        status: SeatStatus.AVAILABLE,
        heldByUserId: null,
        holdExpiresAt: null,
        version: { increment: 1 },
      },
    });
  }

  private effectiveStatus(seat: {
    status: SeatStatus | string;
    holdExpiresAt: Date | null;
  }): SeatStatus {
    if (seat.status === SeatStatus.HELD && isHoldExpired(seat.holdExpiresAt)) {
      return SeatStatus.AVAILABLE;
    }
    return seat.status as SeatStatus;
  }
}
