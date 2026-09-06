import { env } from '../../config/env.js';

export type SystemHealthSummary = {
  name: string;
  environment: string;
  uptimeSeconds: number;
  status: 'ok';
};

export class SystemService {
  constructor(private readonly startedAt = Date.now()) {}

  getHealthSummary(): SystemHealthSummary {
    return {
      name: 'contextcore-api',
      environment: env.NODE_ENV,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      status: 'ok',
    };
  }
}
