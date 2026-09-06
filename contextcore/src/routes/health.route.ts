import { FastifyInstance } from 'fastify';

import { AppService } from '../modules/app/app.service.js';
import { checkDatabaseHealth } from '../services/database-health.service.js';

const appService = new AppService();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/health', async () => {
    const summary = appService.getStatus();

    return {
      status: summary.status,
      service: summary.name,
      timestamp: new Date().toISOString(),
      environment: summary.environment,
      ready: summary.ready,
    };
  });

  app.get('/api/v1/health/ready', async () => {
    const databaseStatus = await checkDatabaseHealth();

    const checks = {
      config: 'valid',
      database: databaseStatus,
      redis: 'pending',
    };

    return {
      status: databaseStatus === 'healthy' ? 'ok' : 'error',
      service: 'contextcore-api',
      timestamp: new Date().toISOString(),
      checks,
    };
  });
}
