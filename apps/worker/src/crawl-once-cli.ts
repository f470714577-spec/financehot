import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { SafeFetcher } from '@financehot/crawler';
import { createDb } from '@financehot/db';

import { crawlOnce } from './crawl-once';

const envFile = resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://financehot:financehot@localhost:5433/financehot';
const connection = createDb(databaseUrl);

async function main() {
  try {
    const stats = await crawlOnce({ db: connection.db, fetcher: new SafeFetcher({ minIntervalMs: 1_000 }) });
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await connection.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
