import { prisma } from '../database/prisma.js';

export type DatabaseHealthState = 'healthy' | 'unhealthy';

export async function checkDatabaseHealth(): Promise<DatabaseHealthState> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'healthy';
  } catch {
    return 'unhealthy';
  }
}
