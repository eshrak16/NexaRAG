import { randomUUID } from 'node:crypto';

import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { HttpAuthError } from '../auth/auth.service.js';
import { knowledgeBaseService } from '../knowledgebase/knowledgebase.service.js';
import { can } from '../organizations/permissions.js';
import { EmbeddingProvider, EmbeddingProviderError, OpenAICompatibleEmbeddingProvider } from './embedding.provider.js';
import { BGE_SMALL_DIMENSIONS, BGE_SMALL_MODEL, LocalEmbeddingProvider } from './local-embedding.provider.js';
import { embeddingRepository, EmbeddingRepository } from './embedding.repository.js';

export type EmbeddingDocumentResult = {
  documentId: string;
  provider: string;
  model: string;
  status: 'READY' | 'FAILED';
  totalChunks: number;
  embeddedChunks: number;
  skippedChunks: number;
  failedChunks: number;
};

type EmbeddingLogger = {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
};

export type EmbeddingServiceOptions = {
  batchSize?: number | undefined;
  retryCount?: number | undefined;
};

const silentLogger: EmbeddingLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function createConfiguredProvider(): EmbeddingProvider {
  if (env.EMBEDDING_PROVIDER === 'local') {
    return new LocalEmbeddingProvider({ model: env.EMBEDDING_MODEL, dimensions: env.EMBEDDING_DIMENSIONS });
  }

  if (!env.EMBEDDING_API_KEY) {
    throw new Error('Embedding provider API key is not configured.');
  }

  if (env.EMBEDDING_MODEL === BGE_SMALL_MODEL || env.EMBEDDING_DIMENSIONS === BGE_SMALL_DIMENSIONS) {
    throw new Error('The local BGE model requires EMBEDDING_PROVIDER=local and cannot use the OpenAI-compatible provider.');
  }

  return new OpenAICompatibleEmbeddingProvider({
    apiKey: env.EMBEDDING_API_KEY,
    baseUrl: env.EMBEDDING_BASE_URL,
    model: env.EMBEDDING_MODEL,
    dimensions: env.EMBEDDING_DIMENSIONS,
  });
}

function safeProviderError(error: unknown): string {
  if (error instanceof EmbeddingProviderError) {
    return error.message;
  }
  return 'Embedding generation failed.';
}

export class EmbeddingService {
  private readonly providerFactory: () => EmbeddingProvider;
  private readonly repository: EmbeddingRepository;
  private readonly logger: EmbeddingLogger;
  private readonly batchSize: number;
  private readonly retryCount: number;

  constructor(
    providerFactory: () => EmbeddingProvider = createConfiguredProvider,
    repository: EmbeddingRepository = embeddingRepository,
    logger: EmbeddingLogger = silentLogger,
    options: EmbeddingServiceOptions = {},
  ) {
    this.providerFactory = providerFactory;
    this.repository = repository;
    this.logger = logger;
    this.batchSize = options.batchSize ?? env.EMBEDDING_BATCH_SIZE;
    this.retryCount = options.retryCount ?? env.EMBEDDING_RETRY_COUNT;
  }

  async embedDocument(documentId: string, userId?: string): Promise<EmbeddingDocumentResult> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, knowledgeBaseId: true },
    });

    if (!document) {
      throw new HttpAuthError('DOCUMENT_NOT_FOUND', 'Document not found.', 404);
    }

    if (userId !== undefined) {
      const membership = await knowledgeBaseService.getMembershipForKnowledgeBase(document.knowledgeBaseId, userId);
      if (!membership || !can(membership.role, 'document:update')) {
        throw new HttpAuthError('FORBIDDEN', 'You do not have permission to embed this document.', 403);
      }
    }

    const chunks = await prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: 'asc' },
      select: { id: true, content: true, contentHash: true },
    });

    const provider = this.providerFactory();
    if (provider.dimensions !== env.EMBEDDING_DIMENSIONS) {
      throw new Error('Embedding provider dimensions do not match EMBEDDING_DIMENSIONS.');
    }

    const existing = await this.repository.findReadyByChunks(
      chunks.map((chunk) => chunk.id),
      provider.provider,
      provider.model,
    );
    const readyByChunk = new Map(existing.map((embedding) => [embedding.chunkId, embedding.contentHash]));
    const pending = chunks.filter((chunk) => readyByChunk.get(chunk.id) !== chunk.contentHash);
    const skippedChunks = chunks.length - pending.length;

    this.logger.info({ documentId, chunkCount: chunks.length, batchSize: this.batchSize, provider: provider.provider, model: provider.model }, 'Starting document embedding');

    for (const chunk of pending) {
      await this.repository.markProcessing(randomUUID(), chunk.id, provider.provider, provider.model, provider.dimensions, chunk.contentHash);
    }

    let embeddedChunks = 0;
    let failedChunks = 0;

    for (let offset = 0; offset < pending.length; offset += this.batchSize) {
      const batch = pending.slice(offset, offset + this.batchSize);
      try {
        const vectors = await this.embedWithRetry(provider, batch.map((chunk) => chunk.content));
        if (vectors.length !== batch.length) {
          throw new EmbeddingProviderError('Embedding provider returned an invalid vector count.', false);
        }

        for (let index = 0; index < batch.length; index += 1) {
          const chunk = batch[index];
          const vector = vectors[index];
          if (!chunk || !vector || vector.length !== provider.dimensions) {
            throw new EmbeddingProviderError('Embedding provider returned an invalid vector dimension.', false);
          }
          await this.repository.saveReady(chunk.id, provider.provider, provider.model, provider.dimensions, chunk.contentHash, vector);
          embeddedChunks += 1;
        }
      } catch (error) {
        const message = safeProviderError(error);
        await this.repository.markFailed(batch.map((chunk) => chunk.id), provider.provider, provider.model, message);
        failedChunks += batch.length;
        this.logger.error({ documentId, batchStart: offset, batchSize: batch.length, provider: provider.provider, model: provider.model, failureCategory: error instanceof EmbeddingProviderError && error.transient ? 'transient' : 'permanent' }, 'Document embedding batch failed');
      }
    }

    const status = failedChunks === 0 ? 'READY' : 'FAILED';
    this.logger.info({ documentId, provider: provider.provider, model: provider.model, embeddedChunks, skippedChunks, failedChunks, status }, 'Document embedding finished');

    return {
      documentId,
      provider: provider.provider,
      model: provider.model,
      status,
      totalChunks: chunks.length,
      embeddedChunks,
      skippedChunks,
      failedChunks,
    };
  }

  private async embedWithRetry(provider: EmbeddingProvider, texts: string[]): Promise<number[][]> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        return await provider.embedTexts(texts);
      } catch (error) {
        lastError = error;
        if (!(error instanceof EmbeddingProviderError) || !error.transient || attempt === this.retryCount) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Embedding generation failed.');
  }
}

export const embeddingService = new EmbeddingService();
