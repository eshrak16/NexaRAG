import { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { authenticate } from '../modules/auth/auth.middleware.js';
import { HttpAuthError } from '../modules/auth/auth.service.js';
import { AskServiceError, askService } from '../modules/embeddings/ask.service.js';
import { semanticSearchParamsSchema, semanticSearchRequestSchema } from '../modules/embeddings/semantic-search.schema.js';

export async function askRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/knowledge-bases/:knowledgeBaseId/ask', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const params = semanticSearchParamsSchema.parse(request.params);
      const body = semanticSearchRequestSchema.parse(request.body);
      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const result = await askService.ask(params.knowledgeBaseId, request.user.id, body.query, body.topK);
      request.log.info({
        knowledgeBaseId: result.knowledgeBaseId,
        retrievedChunks: result.retrieval.retrievedChunks,
        citationCount: result.citations.length,
        llmProvider: result.generation.provider,
        llmModel: result.generation.model,
      }, 'RAG answer generated');
      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof HttpAuthError || error instanceof AskServiceError) {
        if (error instanceof AskServiceError && error.diagnostics) {
          request.log.warn({
            knowledgeBaseId: (request.params as { knowledgeBaseId?: string }).knowledgeBaseId,
            errorCode: error.code,
            ...error.diagnostics,
          }, 'RAG answer provider diagnostic');
        }
        return reply.status(error.statusCode).send({
          error: { code: error.code, message: error.message },
        });
      }

      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid ask request.' },
        });
      }

      request.log.error({
        knowledgeBaseId: (request.params as { knowledgeBaseId?: string }).knowledgeBaseId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }, 'RAG answer generation failed');
      return reply.status(500).send({
        error: { code: 'ASK_FAILED', message: 'Answer generation failed.' },
      });
    }
  });
}
