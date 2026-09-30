import { FastifyInstance } from 'fastify';

import { authenticate } from '../modules/auth/auth.middleware.js';
import { HttpAuthError } from '../modules/auth/auth.service.js';
import { documentService } from '../modules/document/document.service.js';
import { ingestionService } from '../modules/ingestion/ingestion.service.js';
import { embeddingService } from '../modules/embeddings/embedding.service.js';
import { createDocumentSchema, documentIdParamSchema, documentQuerySchema, knowledgeBaseDocumentIdParamSchema, updateDocumentSchema } from '../modules/document/document.schema.js';
import { requireKnowledgeBaseMembership, requireKnowledgeBasePermission } from '../modules/knowledgebase/knowledgebase.authorization.js';

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/documents/:id/embed', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const params = documentIdParamSchema.parse(request.params);
      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const result = await embeddingService.embedDocument(params.id, request.user.id);
      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      }

      if (error instanceof Error) {
        return reply.status(400).send({ error: { code: 'EMBEDDING_ERROR', message: error.message } });
      }

      throw error;
    }
  });

  app.post('/api/v1/knowledge-bases/:knowledgeBaseId/documents/upload', { preHandler: [authenticate, requireKnowledgeBasePermission('document:upload')] }, async (request, reply) => {
    try {
      const params = knowledgeBaseDocumentIdParamSchema.parse(request.params);
      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: { code: 'FILE_REQUIRED', message: 'A document file is required.' } });
      }

      const result = await ingestionService.uploadDocument(request.user.id, params.knowledgeBaseId, {
        originalFileName: file.filename,
        mimeType: file.mimetype,
        buffer: await file.toBuffer(),
      });

      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof HttpAuthError) {
        return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      }

      if (error && typeof error === 'object' && 'code' in error && error.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(413).send({ error: { code: 'FILE_TOO_LARGE', message: 'The uploaded file exceeds the configured size limit.' } });
      }

      return reply.status(400).send({ error: { code: 'UPLOAD_ERROR', message: 'The upload could not be accepted. Check the file format and size.' } });
    }
  });

  app.post('/api/v1/knowledge-bases/:knowledgeBaseId/documents', { preHandler: [authenticate, requireKnowledgeBasePermission('document:upload')] }, async (request, reply) => {
    try {
      const params = knowledgeBaseDocumentIdParamSchema.parse(request.params);
      const body = createDocumentSchema.parse(request.body);

      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const document = await documentService.createDocument(request.user.id, params.knowledgeBaseId, body);
      return reply.status(201).send(document);
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

  app.get('/api/v1/knowledge-bases/:knowledgeBaseId/documents', { preHandler: [authenticate, requireKnowledgeBaseMembership] }, async (request, reply) => {
    try {
      const params = knowledgeBaseDocumentIdParamSchema.parse(request.params);
      const query = documentQuerySchema.parse(request.query);

      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const result = await documentService.listDocuments({
        userId: request.user.id,
        knowledgeBaseId: params.knowledgeBaseId,
        page: query.page,
        limit: query.limit,
        search: query.search,
        status: query.status,
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

  app.get('/api/v1/documents/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const params = documentIdParamSchema.parse(request.params);
      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const document = await documentService.getDocumentForUser(params.id, request.user.id);
      return reply.status(200).send(document);
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

  app.patch('/api/v1/documents/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const params = documentIdParamSchema.parse(request.params);
      const body = updateDocumentSchema.parse(request.body);

      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const document = await documentService.updateDocument(params.id, request.user.id, body);
      return reply.status(200).send(document);
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

  app.delete('/api/v1/documents/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const params = documentIdParamSchema.parse(request.params);
      if (!request.user) {
        throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
      }

      const document = await documentService.deleteDocument(params.id, request.user.id);
      return reply.status(200).send(document);
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
