#!/bin/sh
set -e

cd /app/apps/api
npx prisma migrate deploy
npx prisma db seed
node dist/src/main.js
