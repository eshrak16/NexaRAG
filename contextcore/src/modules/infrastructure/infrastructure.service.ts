import { getDatabaseStatus } from '../../config/database.js';
import { getRedisStatus } from '../../config/redis.js';

export type InfrastructureSummary = {
  config: 'valid';
  database: 'configured' | 'pending';
  redis: 'configured' | 'pending';
};

export class InfrastructureService {
  getSummary(): InfrastructureSummary {
    return {
      config: 'valid',
      database: getDatabaseStatus(),
      redis: getRedisStatus(),
    };
  }
}
