import { FastifyInstance } from 'fastify';

import { authenticate } from '../modules/auth/auth.middleware.js';
import { HttpAuthError } from '../modules/auth/auth.service.js';
import { requireKnowledgeBaseMembership, requireKnowledgeBaseRole } from '../modules/knowledgebase/knowledgebase.authorization.js';
import { createKnowledgeBaseSchema, knowledgeBaseIdParamSchema, knowledgeBaseQuerySchema, updateKnowledgeBaseSchema } from '../modules/knowledgebase/knowledgebase.schema.js';
import { knowledgeBaseService } from '../modules/knowledgebase/knowledgebase.service.js';

export async function knowledgeBaseRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/knowledge-bases', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = createKnowledgeBaseSchema.parse(request.body);

      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const result = await knowledgeBaseService.createKnowledgeBase(request.user.id, body);
      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      }

      if (error instanceof Error) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }

      throw error;
    }
  });

  app.get('/api/v1/knowledge-bases', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const query = knowledgeBaseQuerySchema.parse(request.query);
      const result = await knowledgeBaseService.listKnowledgeBases({
        userId: request.user.id,
        organizationId: query.organizationId,
        page: query.page,
        limit: query.limit,
        search: query.search,
      });

      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      }

      if (error instanceof Error) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }

      throw error;
    }
  });

  app.get('/api/v1/knowledge-bases/:id', { preHandler: [authenticate, requireKnowledgeBaseMembership] }, async (request, reply) => {
    try {
      const params = knowledgeBaseIdParamSchema.parse(request.params);
      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const knowledgeBase = await knowledgeBaseService.getKnowledgeBaseForUser(params.id, request.user.id);
      return reply.status(200).send(knowledgeBase);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      }

      if (error instanceof Error) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }

      throw error;
    }
  });

  app.patch('/api/v1/knowledge-bases/:id', { preHandler: [authenticate, requireKnowledgeBaseRole(['OWNER', 'ADMIN', 'MEMBER'])] }, async (request, reply) => {
    try {
      const params = knowledgeBaseIdParamSchema.parse(request.params);
      const body = updateKnowledgeBaseSchema.parse(request.body);

      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const result = await knowledgeBaseService.updateKnowledgeBase(params.id, request.user.id, body);
      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      }

      if (error instanceof Error) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }

      throw error;
    }
  });

  app.delete('/api/v1/knowledge-bases/:id', { preHandler: [authenticate, requireKnowledgeBaseRole(['OWNER', 'ADMIN'])] }, async (request, reply) => {
    try {
      const params = knowledgeBaseIdParamSchema.parse(request.params);
      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const result = await knowledgeBaseService.deleteKnowledgeBase(params.id, request.user.id);
      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      }

      if (error instanceof Error) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }

      throw error;
    }
  });
}
