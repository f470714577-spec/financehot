import { loadEnv } from './config/env';
import { logger } from './logger';

async function main() {
  const env = loadEnv();
  logger.info('FinanceHot Worker started');
  logger.info(`NODE_ENV=${env.NODE_ENV ?? 'development'}`);
  logger.info(`REDIS_URL=${env.REDIS_URL ? 'configured' : 'not configured'}`);
  logger.info(`DATABASE_URL=${env.DATABASE_URL ? 'configured' : 'not configured'}`);
  logger.info('Worker idle (阶段 01：无流水线 job，进程保持存活)');

  // 阶段 01 保持进程存活；阶段 07 接入 BullMQ 消费循环后移除
  setInterval(() => {
    // no-op keepalive
  }, 60_000);
}

main().catch((err) => {
  logger.error('Worker failed to start', err);
  process.exit(1);
});
