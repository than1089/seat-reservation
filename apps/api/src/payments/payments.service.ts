import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, SeatStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SeatsService } from '../seats/seats.service';
import { LockedSeatRow } from '../seats/seats.constants';
import { isHoldExpired } from '../seats/seats.constants';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seatsService: SeatsService,
    private readonly configService: ConfigService,
  ) {}

  async createPayment(
    userId: string,
    seatId: string,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      return this.toPaymentResponse(existing.id);
    }

    await this.seatsService.assertValidHold(seatId, userId);

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        seatId,
        idempotencyKey,
        status: PaymentStatus.PENDING,
      },
    });

    return this.toPaymentResponse(payment.id);
  }

  async getPayment(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        seat: true,
        reservation: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.userId !== userId) {
      throw new UnauthorizedException('Not your payment');
    }

    return {
      id: payment.id,
      status: payment.status,
      seatId: payment.seatId,
      amountCents: payment.seat.amountCents,
      reservationId: payment.reservation?.id ?? null,
      seatNumber: payment.seat.number,
    };
  }

  async confirmPayment(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.userId !== userId) {
      throw new UnauthorizedException('Not your payment');
    }

    return this.completePayment(paymentId, true);
  }

  async handleWebhook(paymentId: string, secret: string, success = true) {
    const expectedSecret =
      this.configService.getOrThrow<string>('WEBHOOK_SECRET');

    if (secret !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    return this.completePayment(paymentId, success);
  }

  // Shared by mock confirm and payment webhooks. Commits payment + seat + reservation atomically.
  private async completePayment(paymentId: string, success: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      // Duplicate webhook/confirm deliveries must not create a second reservation.
      if (payment.status === PaymentStatus.COMPLETED) {
        const reservation = await tx.reservation.findUnique({
          where: { paymentId },
        });
        return {
          id: payment.id,
          status: payment.status,
          reservationId: reservation?.id ?? null,
          idempotent: true,
        };
      }

      if (payment.status === PaymentStatus.FAILED) {
        return {
          id: payment.id,
          status: payment.status,
          reservationId: null,
          idempotent: true,
        };
      }

      // Pessimistic lock on the seat before any state change (same pattern as holdSeat).
      const rows = await tx.$queryRaw<LockedSeatRow[]>`
        SELECT id, number, status, "holdExpiresAt", "heldByUserId", version
        FROM "Seat"
        WHERE id = ${payment.seatId}
        FOR UPDATE
      `;

      const seat = rows[0];
      if (!seat) {
        throw new NotFoundException('Seat not found');
      }

      if (!success) {
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: PaymentStatus.FAILED },
        });

        // Payment failed — release the hold so another user can try for this seat.
        if (
          seat.status === SeatStatus.HELD &&
          seat.heldByUserId === payment.userId
        ) {
          await tx.seat.update({
            where: { id: payment.seatId },
            data: {
              status: SeatStatus.AVAILABLE,
              heldByUserId: null,
              holdExpiresAt: null,
              version: { increment: 1 },
            },
          });
        }

        return {
          id: payment.id,
          status: PaymentStatus.FAILED,
          reservationId: null,
        };
      }

      // Hold must still belong to this payer; otherwise the payment cannot succeed.
      if (
        seat.status === SeatStatus.RESERVED ||
        (seat.status === SeatStatus.HELD &&
          (seat.heldByUserId !== payment.userId ||
            isHoldExpired(seat.holdExpiresAt)))
      ) {
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: PaymentStatus.FAILED },
        });
        throw new GoneException('Seat hold expired or invalid');
      }

      // Happy path: mark paid, reserve seat, and create the reservation in one commit.
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.COMPLETED },
      });

      await tx.seat.update({
        where: { id: payment.seatId },
        data: {
          status: SeatStatus.RESERVED,
          heldByUserId: null,
          holdExpiresAt: null,
          version: { increment: 1 },
        },
      });

      const reservation = await tx.reservation.create({
        data: {
          userId: payment.userId,
          seatId: payment.seatId,
          paymentId: payment.id,
        },
      });

      return {
        id: payment.id,
        status: PaymentStatus.COMPLETED,
        reservationId: reservation.id,
      };
    });
  }

  private async toPaymentResponse(paymentId: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { reservation: true, seat: true },
    });

    return {
      id: payment.id,
      status: payment.status,
      seatId: payment.seatId,
      amountCents: payment.seat.amountCents,
      reservationId: payment.reservation?.id ?? null,
    };
  }
}
