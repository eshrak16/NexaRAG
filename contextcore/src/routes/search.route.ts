import { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { authenticate } from '../modules/auth/auth.middleware.js';
import { HttpAuthError } from '../modules/auth/auth.service.js';
import { semanticSearchParamsSchema, semanticSearchRequestSchema } from '../modules/embeddings/semantic-search.schema.js';
import { semanticSearchService } from '../modules/embeddings/semantic-search.service.js';

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/knowledge-bases/:knowledgeBaseId/search', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const params = semanticSearchParamsSchema.parse(request.params);
      const body = semanticSearchRequestSchema.parse(request.body);

      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const result = await semanticSearchService.searchKnowledgeBase(
        params.knowledgeBaseId,
        request.user.id,
        body.query,
        body.topK,
      );
      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({
          error: { code: error.code, message: error.message },
        });
      }

      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid semantic search request.' },
        });
      }

      request.log.error({ err: error }, 'Semantic search failed');
      return reply.status(500).send({
        error: { code: 'SEARCH_FAILED', message: 'Semantic search failed.' },
      });
    }
  });
}
