import { getDatabaseStatus } from '../../config/database.js';
import { getRedisStatus } from '../../config/redis.js';
import { env } from '../../config/env.js';

export type AppStatus = {
  name: string;
  environment: string;
  status: 'ok';
  ready: boolean;
  infrastructure: {
    database: 'configured' | 'pending';
    redis: 'configured' | 'pending';
  };
};

export class AppService {
  getStatus(): AppStatus {
    return {
      name: 'contextcore-api',
      environment: env.NODE_ENV,
      status: 'ok',
      ready: true,
      infrastructure: {
        database: getDatabaseStatus(),
        redis: getRedisStatus(),
      },
    };
  }
}
