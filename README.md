# Seat Reservation Platform

A small public seat reservation app built as a take-home assessment. Three seats are available; authenticated users can hold a seat, complete a mock payment, and receive a confirmed reservation.

## Stack

- **Backend:** Nest.js, Prisma, PostgreSQL
- **Frontend:** React (Vite), TanStack Query, React Router
- **Auth:** [Clerk](https://clerk.com) (90-day session lifetime configured in Clerk dashboard)
- **Payments:** Mock Stripe-like flow (payment intent + webhook confirmation)
- **Ops:** Docker Compose

## Architecture

```
Browser → Clerk (sign-in) → React app
React app → Nest API (Bearer JWT) → PostgreSQL
Mock payment → POST /webhooks/payments → atomic reservation commit
```

### Reliability patterns

| Concern | Approach |
|---------|----------|
| Seat race conditions | PostgreSQL `SELECT FOR UPDATE` inside short transactions |
| 100 users, 1 seat | Row lock serializes attempts → exactly 1 success, rest `409` |
| Abandoned checkout | 10-minute hold TTL + cron cleanup every minute |
| Duplicate payments | `Idempotency-Key` header on `POST /payments` |
| Duplicate webhooks | Idempotent handler — second delivery is a no-op |

## Prerequisites

- Node.js 22+
- Docker & Docker Compose
- A free [Clerk](https://dashboard.clerk.com) application

## Clerk setup

1. Create a Clerk application.
2. Enable **Email** sign-in (optional: Google/GitHub).
3. Go to **Sessions** → set **Maximum lifetime** to **90 days**.
4. Copy keys into `.env` (see `.env.example`):
   - `CLERK_SECRET_KEY`
   - `VITE_CLERK_PUBLISHABLE_KEY`

## Quick start (Docker)

```bash
cp .env.example .env
# Edit .env with your Clerk keys

docker compose up --build
```

- Web UI: http://localhost:8080
- API: http://localhost:3000
- Health: http://localhost:3000/health

## Local development

```bash
cp .env.example .env
# Fill in Clerk keys

# Start Postgres
docker compose up postgres -d

# Migrate & seed
npm run db:migrate --workspace=apps/api
npm run db:seed --workspace=apps/api

# Terminal 1 — API
npm run dev:api

# Terminal 2 — Web
npm run dev:web
```

- Web: http://localhost:5173
- API: http://localhost:3000

## Manual test script

1. Open http://localhost:5173 (or :8080 with Docker).
2. Sign up / sign in with Clerk.
3. Select an available seat → you are redirected to checkout with a 10-minute timer.
4. Click **Proceed to payment**, then **Pay $25.00 (mock)**.
5. Confirm you land on the confirmation page with your seat number.
6. Open a second browser/incognito window, sign in as another user, and try the same seat → you should see **Seat just taken** (`409`).

## API endpoints

```
GET    /health
GET    /auth/me
GET    /seats
POST   /seats/:id/hold
DELETE /seats/:id/hold
POST   /payments              (Idempotency-Key header)
GET    /payments/:id
POST   /payments/:id/confirm    (dev mock)
POST   /webhooks/payments       (X-Webhook-Secret header)
GET    /reservations/me
```

## Tests

Requires Postgres running (e.g. `docker compose up postgres -d`) with migrations applied.

```bash
# Unit tests
npm run test --workspace=apps/api

# E2E (uses E2E_TEST_MODE with test Bearer tokens)
E2E_TEST_MODE=true npm run test:e2e --workspace=apps/api
```

E2E covers:
- Happy path: hold → pay → confirm → reservation
- 30 parallel hold attempts → exactly 1 success
- Duplicate webhook idempotency

## Trade-offs

- **Clerk vs roll-your-own auth:** Provider handles credentials, MFA, and session lifecycle; requires external keys but reflects real SaaS integration.
- **Lazy user upsert:** User row created on first authenticated API call — simple and sufficient for this scope.
- **10-minute hold TTL:** Prevents seats being locked indefinitely during abandoned checkout.
- **Pessimistic row locking:** Correct and clear for high-contention seat selection; no Redis needed for 3 seats.
- **Mock async payment:** Mirrors Stripe webhook flow and demonstrates idempotent eventual consistency.

## Known limitations

- Single event with 3 fixed seats
- Mock payment only (no Stripe)
- No refunds or seat transfers
- Requires a Clerk dev account for sign-in
