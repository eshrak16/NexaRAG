import { getDatabaseStatus } from './database.js';
import { getRedisStatus } from './redis.js';

export type InfrastructureState = 'configured' | 'pending';

export function getReadinessChecks(): Record<string, InfrastructureState | 'valid'> {
  return {
    config: 'valid',
    database: getDatabaseStatus(),
    redis: getRedisStatus(),
  };
}
