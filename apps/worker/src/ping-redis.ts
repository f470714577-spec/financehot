import Redis from 'ioredis';
import { logger } from './logger';

// 独立 Redis PING 测试入口（阶段 01 基础设施验证，不创建业务 Queue）
async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn('REDIS_URL not configured, skip Redis PING');
    return;
  }
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const pong = await redis.ping();
    logger.info(`Redis PING -> ${pong}`);
  } catch (err) {
    logger.error('Redis connection failed', err);
    process.exitCode = 1;
  } finally {
    await redis.quit().catch(() => undefined);
  }
}

main();
