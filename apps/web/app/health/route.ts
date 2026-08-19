import Redis from 'ioredis';
import { createDb } from '@financehot/db';

export const dynamic = 'force-dynamic';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://financehot:financehot@localhost:5433/financehot';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

type CheckStatus = 'up' | 'down';

type HealthResult = {
  status: 'ok' | 'degraded';
  service: 'financehot-web';
  timestamp: string;
  checks: {
    database: CheckStatus;
    redis: CheckStatus;
  };
};

// 复用连接池，避免每次探活请求创建新的 PostgreSQL 连接池。
let healthDb: ReturnType<typeof createDb> | undefined;

function getDb(): ReturnType<typeof createDb> {
  return (healthDb ??= createDb(DATABASE_URL));
}

async function checkDatabase(): Promise<CheckStatus> {
  try {
    const query = getDb()
      .pool.query('SELECT 1')
      .then(() => true);
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1_500));
    return (await Promise.race([query, timeout])) ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

async function checkRedis(): Promise<CheckStatus> {
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 1_500,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => undefined);

  try {
    await redis.connect();
    return (await redis.ping()) === 'PONG' ? 'up' : 'down';
  } catch {
    return 'down';
  } finally {
    redis.disconnect();
  }
}

export async function GET(): Promise<Response> {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const healthy = database === 'up' && redis === 'up';
  const body: HealthResult = {
    status: healthy ? 'ok' : 'degraded',
    service: 'financehot-web',
    timestamp: new Date().toISOString(),
    checks: { database, redis },
  };

  return Response.json(body, { status: healthy ? 200 : 503 });
}
