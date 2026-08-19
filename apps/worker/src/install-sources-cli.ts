import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { createDb } from '@financehot/db';

import { installStage06Sources, stage06Sources } from './source-catalog';

const envFile = resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://financehot:financehot@localhost:5433/financehot';
const connection = createDb(databaseUrl);

async function main() {
  try {
    const installed = await installStage06Sources(connection.db);
    console.log(JSON.stringify({ installed, sourceCount: stage06Sources.length }, null, 2));
  } finally {
    await connection.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
