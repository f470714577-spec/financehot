import type Redis from 'ioredis';

export class SourceLock {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
    private readonly ttlMs: number,
  ) {}

  private key(sourceId: string) {
    return `${this.prefix}:lock:source:${sourceId}`;
  }

  async tryAcquire(sourceId: string, token: string): Promise<boolean> {
    const result = await this.redis.set(this.key(sourceId), token, 'PX', this.ttlMs, 'NX');
    return result === 'OK';
  }

  async release(sourceId: string, token: string): Promise<void> {
    await this.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      this.key(sourceId),
      token,
    );
  }
}
