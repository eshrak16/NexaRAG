import assert from 'node:assert/strict';
import test from 'node:test';

import { prisma } from '../../database/prisma.js';
import { EmbeddingProviderError, EmbeddingProvider } from './embedding.provider.js';
import { EmbeddingRepository } from './embedding.repository.js';
import { EmbeddingService } from './embedding.service.js';

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function vector(value: number): number[] {
  return Array.from({ length: 384 }, () => value);
}

async function createEmbeddingFixture(chunkCount: number): Promise<{ documentId: string; userId: string; chunkIds: string[]; firstHash: string }> {
  const userId = unique('embedding-user');
  const organization = await prisma.organization.create({
    data: { name: unique('embedding-org'), slug: unique('embedding-org').toLowerCase() },
  });
  await prisma.user.create({
    data: { id: userId, email: `${userId}@example.com`, name: 'Embedding User', passwordHash: 'hash' },
  });
  await prisma.membership.create({
    data: { userId, organizationId: organization.id, role: 'OWNER' },
  });
  const knowledgeBase = await prisma.knowledgeBase.create({
    data: { organizationId: organization.id, name: unique('embedding-kb') },
  });
  const document = await prisma.document.create({
    data: {
      knowledgeBaseId: knowledgeBase.id,
      name: 'embedding.txt',
      originalFileName: 'embedding.txt',
      mimeType: 'text/plain',
      fileSize: 100,
      status: 'READY',
    },
  });
  const chunks = await prisma.documentChunk.createManyAndReturn({
    data: Array.from({ length: chunkCount }, (_, index) => ({
      documentId: document.id,
      chunkIndex: index,
      content: `Chunk ${index}`,
      contentHash: `hash-${index}`,
      characterStart: index * 8,
      characterEnd: index * 8 + 7,
      estimatedTokenCount: 2,
      chunkingVersion: 'v1',
    })),
  });
  chunks.sort((left, right) => left.chunkIndex - right.chunkIndex);

  return {
    documentId: document.id,
    userId,
    chunkIds: chunks.map((chunk) => chunk.id),
    firstHash: 'hash-0',
  };
}

test('embedding service batches in chunk order and skips matching content hashes', async () => {
  const fixture = await createEmbeddingFixture(4);
  const marked: string[] = [];
  const saved: string[] = [];
  const batches: string[][] = [];
  const repository = {
    findReadyByChunks: async () => [{ chunkId: fixture.chunkIds[0]!, provider: 'test-provider', model: 'test-model', contentHash: fixture.firstHash }],
    searchSimilarChunks: async () => [],
    markProcessing: async (_id: string, chunkId: string) => { marked.push(chunkId); },
    saveReady: async (chunkId: string) => { saved.push(chunkId); },
    markFailed: async () => undefined,
  } as EmbeddingRepository;
  const provider: EmbeddingProvider = {
    provider: 'test-provider',
    model: 'test-model',
    dimensions: 384,
    embedTexts: async (texts) => {
      batches.push(texts);
      return texts.map((_, index) => vector(index + 1));
    },
  };

  const result = await new EmbeddingService(() => provider, repository, undefined, { batchSize: 2, retryCount: 0 }).embedDocument(fixture.documentId, fixture.userId);

  assert.equal(result.status, 'READY');
  assert.equal(result.totalChunks, 4);
  assert.equal(result.skippedChunks, 1);
  assert.equal(result.embeddedChunks, 3);
  assert.equal(result.failedChunks, 0);
  assert.deepEqual(marked, fixture.chunkIds.slice(1));
  assert.deepEqual(saved, fixture.chunkIds.slice(1));
  assert.deepEqual(batches, [['Chunk 1', 'Chunk 2'], ['Chunk 3']]);
});

test('embedding service retries transient failures a bounded number of times', async () => {
  const fixture = await createEmbeddingFixture(1);
  let attempts = 0;
  let failures = 0;
  const repository = {
    findReadyByChunks: async () => [],
    searchSimilarChunks: async () => [],
    markProcessing: async () => undefined,
    saveReady: async () => undefined,
    markFailed: async () => { failures += 1; },
  } as EmbeddingRepository;
  const provider: EmbeddingProvider = {
    provider: 'retry-provider',
    model: 'retry-model',
    dimensions: 384,
    embedTexts: async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new EmbeddingProviderError('temporary failure', true);
      }
      return [vector(1)];
    },
  };

  const result = await new EmbeddingService(() => provider, repository, undefined, { batchSize: 1, retryCount: 2 }).embedDocument(fixture.documentId, fixture.userId);

  assert.equal(result.status, 'READY');
  assert.equal(attempts, 3);
  assert.equal(failures, 0);
});
