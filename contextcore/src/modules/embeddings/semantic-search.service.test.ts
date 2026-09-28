import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { prisma } from '../../database/prisma.js';
import { KnowledgeBaseService } from '../knowledgebase/knowledgebase.service.js';
import { EmbeddingProvider, EmbeddingProviderError } from './embedding.provider.js';
import { EmbeddingRepository } from './embedding.repository.js';
import { BGE_SMALL_DIMENSIONS, BGE_SMALL_MODEL } from './local-embedding.provider.js';
import { semanticSearchRequestSchema } from './semantic-search.schema.js';
import { SemanticSearchService } from './semantic-search.service.js';

function unitVector(index: number): number[] {
  return Array.from({ length: BGE_SMALL_DIMENSIONS }, (_, component) => component === index ? 1 : 0);
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

async function createDocument(knowledgeBaseId: string, suffix: string, chunkCount: number): Promise<{ id: string; chunkIds: string[] }> {
  const document = await prisma.document.create({
    data: {
      knowledgeBaseId,
      name: `${suffix}.txt`,
      originalFileName: `${suffix}.txt`,
      mimeType: 'text/plain',
      fileSize: 128,
      status: 'READY',
    },
  });

  const chunks = await Promise.all(Array.from({ length: chunkCount }, (_, chunkIndex) => prisma.documentChunk.create({
    data: {
      documentId: document.id,
      chunkIndex,
      content: `${suffix} chunk ${chunkIndex}`,
      contentHash: `${suffix}-hash-${chunkIndex}`,
      characterStart: chunkIndex * 20,
      characterEnd: chunkIndex * 20 + 19,
      estimatedTokenCount: 5,
      chunkingVersion: 'test-v1',
    },
    select: { id: true },
  })));

  return { id: document.id, chunkIds: chunks.map((chunk) => chunk.id) };
}

async function insertFailedEmbedding(chunkId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "embeddings" ("id", "chunkId", "provider", "model", "dimensions", "contentHash", "status", "processingError", "vector", "createdAt", "updatedAt")
     VALUES ($1, $2, 'local', $3, $4, $5, 'FAILED', 'test failure', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    randomUUID(),
    chunkId,
    BGE_SMALL_MODEL,
    BGE_SMALL_DIMENSIONS,
    'failed-test-hash',
  );
}

test('semantic search validates query and topK bounds', () => {
  assert.equal(semanticSearchRequestSchema.safeParse({ query: '  meaning  ' }).success, true);
  assert.equal(semanticSearchRequestSchema.safeParse({ query: '   ' }).success, false);
  assert.equal(semanticSearchRequestSchema.safeParse({ query: 'meaning', topK: 0 }).success, false);
  assert.equal(semanticSearchRequestSchema.safeParse({ query: 'meaning', topK: 21 }).success, false);
  assert.equal(semanticSearchRequestSchema.parse({ query: 'meaning' }).topK, 5);
});

test('semantic search ranks only ready BGE vectors within an authorized knowledge base', async () => {
  const suffix = randomUUID();
  const userId = randomUUID();
  const orgId = randomUUID();
  const foreignOrgId = randomUUID();
  let targetKnowledgeBaseId: string | undefined;
  let foreignKnowledgeBaseId: string | undefined;

  try {
    const organization = await prisma.organization.create({
      data: { id: orgId, name: `Search Org ${suffix}`, slug: `search-${suffix}` },
    });
    const foreignOrganization = await prisma.organization.create({
      data: { id: foreignOrgId, name: `Foreign Search Org ${suffix}`, slug: `foreign-search-${suffix}` },
    });
    await prisma.user.create({
      data: { id: userId, email: `search-${suffix}@example.test`, name: 'Search Test User', passwordHash: 'test-hash' },
    });
    await prisma.membership.create({
      data: { userId, organizationId: organization.id, role: 'MEMBER' },
    });

    const targetKnowledgeBase = await prisma.knowledgeBase.create({
      data: { organizationId: organization.id, name: `Search KB ${suffix}` },
    });
    const foreignKnowledgeBase = await prisma.knowledgeBase.create({
      data: { organizationId: foreignOrganization.id, name: `Foreign Search KB ${suffix}` },
    });
    targetKnowledgeBaseId = targetKnowledgeBase.id;
    foreignKnowledgeBaseId = foreignKnowledgeBase.id;

    const targetDocument = await createDocument(targetKnowledgeBase.id, `target-${suffix}`, 6);
    const foreignDocument = await createDocument(foreignKnowledgeBase.id, `foreign-${suffix}`, 1);
    const repository = new EmbeddingRepository();

    await repository.saveReady(targetDocument.chunkIds[0]!, 'local', BGE_SMALL_MODEL, BGE_SMALL_DIMENSIONS, 'ready-0', unitVector(0));
    await repository.saveReady(targetDocument.chunkIds[1]!, 'local', BGE_SMALL_MODEL, BGE_SMALL_DIMENSIONS, 'ready-1', unitVector(1));
    await repository.saveReady(targetDocument.chunkIds[2]!, 'local', 'some-other-model', BGE_SMALL_DIMENSIONS, 'wrong-model', unitVector(0));
    await insertFailedEmbedding(targetDocument.chunkIds[3]!);
    await repository.saveReady(targetDocument.chunkIds[4]!, 'different-provider', BGE_SMALL_MODEL, BGE_SMALL_DIMENSIONS, 'wrong-provider', unitVector(0));
    await repository.saveReady(foreignDocument.chunkIds[0]!, 'local', BGE_SMALL_MODEL, BGE_SMALL_DIMENSIONS, 'foreign-ready', unitVector(0));
    await repository.saveReady(targetDocument.chunkIds[5]!, 'local', BGE_SMALL_MODEL, 1536, 'wrong-dimensions', unitVector(0));

    let embeddingCalls = 0;
    const provider: EmbeddingProvider = {
      provider: 'local',
      model: BGE_SMALL_MODEL,
      dimensions: BGE_SMALL_DIMENSIONS,
      embedTexts: async (texts) => {
        embeddingCalls += 1;
        assert.deepEqual(texts, ['find the closest meaning']);
        return [unitVector(0)];
      },
    };
    const service = new SemanticSearchService(() => provider, repository, new KnowledgeBaseService());

    const result = await service.searchKnowledgeBase(targetKnowledgeBase.id, userId, 'find the closest meaning', 2);
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0]?.chunkId, targetDocument.chunkIds[0]);
    assert.equal(result.results[0]?.documentId, targetDocument.id);
    assert.equal(result.results[0]?.text, `target-${suffix} chunk 0`);
    assert.equal(result.results[0]?.cosineDistance, 0);
    assert.equal(result.results[1]?.chunkId, targetDocument.chunkIds[1]);
    assert.equal(result.results[1]?.cosineDistance, 1);
    assert.equal(embeddingCalls, 1);
    assert.ok(result.results.every((hit) => hit.documentId !== foreignDocument.id));

    await assert.rejects(
      () => service.searchKnowledgeBase(foreignKnowledgeBase.id, userId, 'find the closest meaning', 2),
      (error: unknown) => error instanceof Error && 'statusCode' in error && error.statusCode === 403,
    );
    await assert.rejects(
      () => service.searchKnowledgeBase(randomUUID(), userId, 'find the closest meaning', 2),
      (error: unknown) => error instanceof Error && 'statusCode' in error && error.statusCode === 404,
    );
    assert.equal(embeddingCalls, 1, 'unauthorized searches must not invoke the embedding provider');
  } finally {
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, foreignOrgId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
});

test('semantic search rejects non-local or wrong-dimension query providers', async () => {
  let providerCalled = false;
  const provider: EmbeddingProvider = {
    provider: 'openai-compatible',
    model: BGE_SMALL_MODEL,
    dimensions: BGE_SMALL_DIMENSIONS,
    embedTexts: async () => {
      providerCalled = true;
      return [unitVector(0)];
    },
  };
  const knowledgeBases = {
    getKnowledgeBaseForUser: async () => ({
      id: 'kb',
      organizationId: 'org',
      name: 'kb',
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };
  const repository = {
    searchSimilarChunks: async () => [],
  };
  const service = new SemanticSearchService(() => provider, repository, knowledgeBases);

  await assert.rejects(
    () => service.searchKnowledgeBase('kb', 'user', 'query', 5),
    (error: unknown) => error instanceof Error && 'statusCode' in error && error.statusCode === 503,
  );
  assert.equal(providerCalled, false);
});

test('semantic search maps local inference failures to a safe service error', async () => {
  const provider: EmbeddingProvider = {
    provider: 'local',
    model: BGE_SMALL_MODEL,
    dimensions: BGE_SMALL_DIMENSIONS,
    embedTexts: async () => {
      throw new EmbeddingProviderError('internal model filesystem path', false);
    },
  };
  const knowledgeBases = {
    getKnowledgeBaseForUser: async () => ({
      id: 'kb',
      organizationId: 'org',
      name: 'kb',
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };
  const repository = { searchSimilarChunks: async () => [] };
  const service = new SemanticSearchService(() => provider, repository, knowledgeBases);

  await assert.rejects(
    () => service.searchKnowledgeBase('kb', 'user', 'query', 5),
    (error: unknown) => error instanceof Error
      && 'statusCode' in error
      && error.statusCode === 503
      && !error.message.includes('filesystem path'),
  );
});
