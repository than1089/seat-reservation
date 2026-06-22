import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, '..');

const e2eDatabaseUrl =
  process.env.E2E_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/seat_reservation_e2e_test?schema=public';

const databaseName = new URL(
  e2eDatabaseUrl.replace(/^postgresql:/, 'http:'),
).pathname.slice(1);

const adminUrl = e2eDatabaseUrl.replace(/\/[^/]+(\?|$)/, `/postgres$1`);

const adminPool = new pg.Pool({ connectionString: adminUrl });

try {
  const { rows } = await adminPool.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [databaseName],
  );

  if (rows.length === 0) {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    console.log(`Created database "${databaseName}"`);
  }
} finally {
  await adminPool.end();
}

execSync('npx prisma migrate deploy', {
  cwd: apiRoot,
  env: { ...process.env, DATABASE_URL: e2eDatabaseUrl },
  stdio: 'inherit',
});
