import { env } from './env.js';

export type RedisStatus = 'configured' | 'pending';

export function isRedisConfigured(): boolean {
  return Boolean(env.REDIS_URL || (env.REDIS_HOST && env.REDIS_PORT));
}

export function getRedisStatus(): RedisStatus {
  return isRedisConfigured() ? 'configured' : 'pending';
}
