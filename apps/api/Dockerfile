FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --workspace=apps/api

COPY apps/api ./apps/api
# prisma generate does not connect to the DB, but prisma.config.ts still requires DATABASE_URL.
ENV DATABASE_URL="postgresql://postgres:postgres@postgres:5432/seat_reservation?schema=public"
RUN npm run db:generate --workspace=apps/api && npm run build --workspace=apps/api

FROM node:22-alpine AS runner

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --workspace=apps/api --omit=dev

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

COPY apps/api/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV NODE_ENV=production
ENV NODE_PATH=/app/node_modules:/app/apps/api/node_modules
EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
