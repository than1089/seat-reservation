import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SeatStatus } from '../src/generated/prisma/enums';

describe('Reservation flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const userA = 'Bearer test:user-a:alice@example.com';
  const userB = 'Bearer test:user-b:bob@example.com';

  beforeAll(async () => {
    process.env.E2E_TEST_MODE = 'true';
    process.env.CLERK_SECRET_KEY = 'test-secret';
    process.env.WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/seat_reservation?schema=public';

    execSync('npx prisma migrate deploy', {
      cwd: join(__dirname, '..'),
      env: process.env,
      stdio: 'inherit',
    });
    execSync('npx prisma db seed', {
      cwd: join(__dirname, '..'),
      env: process.env,
      stdio: 'inherit',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.seat.updateMany({
      data: {
        status: SeatStatus.AVAILABLE,
        heldByUserId: null,
        holdExpiresAt: null,
      },
    });
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('completes happy path: hold -> pay -> confirm -> reservation', async () => {
    const seatsRes = await request(app.getHttpServer())
      .get('/seats')
      .set('Authorization', userA)
      .expect(200);

    const seatId = seatsRes.body[0].id;

    await request(app.getHttpServer())
      .post(`/seats/${seatId}/hold`)
      .set('Authorization', userA)
      .expect(201);

    const paymentRes = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', userA)
      .set('Idempotency-Key', 'happy-path-key')
      .send({ seatId })
      .expect(201);

    const confirmRes = await request(app.getHttpServer())
      .post(`/payments/${paymentRes.body.id}/confirm`)
      .set('Authorization', userA)
      .expect(201);

    expect(confirmRes.body.status).toBe('COMPLETED');
    expect(confirmRes.body.reservationId).toBeTruthy();

    const reservations = await request(app.getHttpServer())
      .get('/reservations/me')
      .set('Authorization', userA)
      .expect(200);

    expect(reservations.body).toHaveLength(1);
  });

  it('allows only one winner when many users hold the same seat', async () => {
    const seatsRes = await request(app.getHttpServer()).get('/seats').expect(200);
    const seatId = seatsRes.body[0].id;

    const attempts = Array.from({ length: 2 }, (_, index) =>
      request(app.getHttpServer())
        .post(`/seats/${seatId}/hold`)
        .set(
          'Authorization',
          index % 2 === 0 ? userA : userB,
        ),
    );

    const results = await Promise.all(attempts);
    const successes = results.filter((res) => res.status === 201);
    const conflicts = results.filter((res) => res.status === 409);

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
  });

  it('handles duplicate webhook idempotently', async () => {
    const seatsRes = await request(app.getHttpServer())
      .get('/seats')
      .set('Authorization', userA)
      .expect(200);

    const seatId = seatsRes.body[0].id;

    await request(app.getHttpServer())
      .post(`/seats/${seatId}/hold`)
      .set('Authorization', userA)
      .expect(201);

    const paymentRes = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', userA)
      .set('Idempotency-Key', 'webhook-key')
      .send({ seatId })
      .expect(201);

    const paymentId = paymentRes.body.id;

    await request(app.getHttpServer())
      .post('/webhooks/payments')
      .set('X-Webhook-Secret', 'test-webhook-secret')
      .send({ paymentId, success: true })
      .expect(201);

    const secondWebhook = await request(app.getHttpServer())
      .post('/webhooks/payments')
      .set('X-Webhook-Secret', 'test-webhook-secret')
      .send({ paymentId, success: true })
      .expect(201);

    expect(secondWebhook.body.idempotent).toBe(true);

    const reservations = await prisma.reservation.findMany({
      where: { paymentId },
    });
    expect(reservations).toHaveLength(1);
  });
});
