import { env } from './config/env.js';
import { buildApp } from './app.js';

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`ContextCore API listening on http://localhost:${env.PORT}`);
  } catch (error) {
    app.log.error(error, 'Failed to start server');
    process.exit(1);
  }

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'Shutting down server');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void start();
