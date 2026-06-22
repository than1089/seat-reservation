jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '../generated/prisma/enums';
import { PaymentsService } from './payments.service';
import { SeatsService } from '../seats/seats.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PaymentsService', () => {
  let service: PaymentsService;

  const prisma = {
    payment: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    reservation: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    seat: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const seatsService = {
    assertValidHold: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SeatsService, useValue: seatsService },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'test-webhook-secret' },
        },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  it('returns existing payment for duplicate idempotency key', async () => {
    prisma.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      status: PaymentStatus.PENDING,
      seatId: 'seat-1',
    });
    prisma.payment.findUniqueOrThrow.mockResolvedValue({
      id: 'pay-1',
      status: PaymentStatus.PENDING,
      seatId: 'seat-1',
      seat: { amountCents: 2500 },
      reservation: null,
    });

    const result = await service.createPayment('user-1', 'seat-1', 'same-key');

    expect(result.id).toBe('pay-1');
    expect(seatsService.assertValidHold).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('returns idempotent response when webhook fires twice', async () => {
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    prisma.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      userId: 'user-1',
      seatId: 'seat-1',
      status: PaymentStatus.COMPLETED,
    });
    prisma.reservation.findUnique.mockResolvedValue({ id: 'res-1' });

    const result = await service.handleWebhook('pay-1', 'test-webhook-secret');

    expect(result.idempotent).toBe(true);
    expect(result.reservationId).toBe('res-1');
    expect(prisma.reservation.create).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
