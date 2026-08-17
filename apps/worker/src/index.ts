import { loadEnv } from './config/env';
import { logger } from './logger';
import { createDb } from '@financehot/db';
import { createWorkerRuntime } from './queue/runtime';

async function main() {
  const env = loadEnv();
  const databaseUrl = env.DATABASE_URL ?? 'postgresql://financehot:financehot@localhost:5433/financehot';
  const redisUrl = env.REDIS_URL ?? 'redis://localhost:6379';
  const connection = createDb(databaseUrl);
  const runtime = createWorkerRuntime({ db: connection.db, redisUrl });
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`收到 ${signal}，停止接收新任务并等待在途任务`);
    runtime.stopAccepting();
    await runtime.close();
    await connection.pool.end();
    logger.info('Worker graceful shutdown completed');
  };
  process.once('SIGINT', () => void shutdown('SIGINT').then(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown('SIGTERM').then(() => process.exit(0)));
  logger.info('FinanceHot Worker started');
  logger.info(`NODE_ENV=${env.NODE_ENV ?? 'development'}`);
  logger.info(`REDIS_URL=${env.REDIS_URL ? 'configured' : 'default localhost'}`);
  logger.info(`DATABASE_URL=${env.DATABASE_URL ? 'configured' : 'default localhost'}`);
  await runtime.start();
  logger.info(`Worker queues started: crawl, normalize; concurrency=${runtime.config.concurrency}`);
}

main().catch((err) => {
  logger.error('Worker failed to start', err);
  process.exit(1);
});
