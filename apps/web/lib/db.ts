import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDb, type Db } from '@financehot/db';

const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv) && typeof process.loadEnvFile === 'function') process.loadEnvFile(rootEnv);

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://financehot:financehot@localhost:5433/financehot';

const globalForFinanceHot = globalThis as typeof globalThis & { financeHotDb?: Db };

export function getDb(): Db {
  globalForFinanceHot.financeHotDb ??= createDb(databaseUrl);
  return globalForFinanceHot.financeHotDb;
}
