import { env } from './env.js';

export type DatabaseStatus = 'configured' | 'pending';

export function isDatabaseConfigured(): boolean {
  return Boolean(env.DATABASE_URL || (env.DATABASE_HOST && env.DATABASE_PORT));
}

export function getDatabaseStatus(): DatabaseStatus {
  return isDatabaseConfigured() ? 'configured' : 'pending';
}
