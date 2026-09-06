import { FastifyInstance } from 'fastify';

import { authenticate } from '../modules/auth/auth.middleware.js';
import { authService, HttpAuthError } from '../modules/auth/auth.service.js';
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from '../modules/auth/auth.schema.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/auth/register', async (request, reply) => {
    try {
      const body = registerSchema.parse(request.body);
      const result = await authService.register(body.email, body.name, body.password);

      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      if (error instanceof Error) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);
      const result = await authService.login(body.email, body.password);

      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      if (error instanceof Error) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    try {
      const body = refreshSchema.parse(request.body);
      const result = await authService.refresh(body.refreshToken);

      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      if (error instanceof Error) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    try {
      const body = logoutSchema.parse(request.body ?? {});

      if (request.headers.authorization && request.headers.authorization.startsWith('Bearer ')) {
        const accessToken = request.headers.authorization.slice(7).trim();
        const payload = authService.verifyAccessToken(accessToken);
        await authService.logout(payload.sub, body.refreshToken);

        return reply.status(200).send({ success: true });
      }

      if (request.user) {
        await authService.logout(request.user.id, body.refreshToken);
        return reply.status(200).send({ success: true });
      }

      if (body.refreshToken) {
        await authService.logout('', body.refreshToken);
        return reply.status(200).send({ success: true });
      }

      await authService.logout('', undefined);
      return reply.status(200).send({ success: true });
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      if (error instanceof Error) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.get('/api/v1/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication is required.',
        },
      });
    }

    return reply.status(200).send({ user: request.user });
  });
}
