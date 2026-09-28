import fastify, { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';

import { env } from './config/env.js';
import { authRoutes } from './routes/auth.route.js';
import { documentRoutes } from './routes/document.route.js';
import { healthRoutes } from './routes/health.route.js';
import { knowledgeBaseRoutes } from './routes/knowledgebase.route.js';
import { organizationRoutes } from './routes/organization.route.js';
import { searchRoutes } from './routes/search.route.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN ?? true,
    credentials: true,
  });

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  });

  await app.register(authRoutes);
  await app.register(organizationRoutes);
  await app.register(knowledgeBaseRoutes);
  await app.register(documentRoutes);
  await app.register(searchRoutes);
  await app.register(healthRoutes);

  app.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      const requestId = request.id;

      app.log.error({ err: error, requestId, method: request.method, url: request.url }, 'Request failed');

      const statusCode = error.statusCode ?? 500;
      const code = error.code ?? 'INTERNAL_SERVER_ERROR';

      reply.status(statusCode).send({
        error: {
          code,
          message: statusCode >= 500 ? 'An unexpected error occurred.' : error.message,
          requestId,
        },
      });
    },
  );

  return app;
}
