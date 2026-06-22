import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const pool = new pg.Pool({ connectionString });

try {
  for (const number of [1, 2, 3]) {
    await pool.query(
      `INSERT INTO "Seat" (id, number, status, "amountCents", version)
       VALUES (gen_random_uuid(), $1, 'AVAILABLE', 2500, 0)
       ON CONFLICT (number) DO NOTHING`,
      [number],
    );
  }
  console.log('Seeded 3 seats');
} finally {
  await pool.end();
}
