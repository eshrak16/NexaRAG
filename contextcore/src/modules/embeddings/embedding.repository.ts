import { prisma } from '../../database/prisma.js';

export type ReadyEmbedding = {
  chunkId: string;
  provider: string;
  model: string;
  contentHash: string;
};

function placeholders(count: number, startAt = 1): string {
  return Array.from({ length: count }, (_, index) => `$${index + startAt}`).join(', ');
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

export class EmbeddingRepository {
  async findReadyByChunks(chunkIds: string[], provider: string, model: string): Promise<ReadyEmbedding[]> {
    if (chunkIds.length === 0) {
      return [];
    }

    const query = `SELECT "chunkId", "provider", "model", "contentHash"
      FROM "embeddings"
      WHERE "chunkId" IN (${placeholders(chunkIds.length)})
        AND "provider" = $${chunkIds.length + 1}
        AND "model" = $${chunkIds.length + 2}
        AND "status" = 'READY'`;

    return prisma.$queryRawUnsafe<ReadyEmbedding[]>(query, ...chunkIds, provider, model);
  }

  async markProcessing(id: string, chunkId: string, provider: string, model: string, dimensions: number, contentHash: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "embeddings" ("id", "chunkId", "provider", "model", "dimensions", "contentHash", "status", "processingError", "vector", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSING', NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("chunkId", "provider", "model") DO UPDATE SET
         "dimensions" = EXCLUDED."dimensions",
         "contentHash" = EXCLUDED."contentHash",
         "status" = 'PROCESSING',
         "processingError" = NULL,
         "vector" = NULL,
         "updatedAt" = CURRENT_TIMESTAMP`,
      id,
      chunkId,
      provider,
      model,
      dimensions,
      contentHash,
    );
  }

  async saveReady(chunkId: string, provider: string, model: string, dimensions: number, contentHash: string, vector: number[]): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "embeddings" ("id", "chunkId", "provider", "model", "dimensions", "contentHash", "status", "processingError", "vector", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'READY', NULL, CAST($6 AS vector), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("chunkId", "provider", "model") DO UPDATE SET
         "dimensions" = EXCLUDED."dimensions",
         "contentHash" = EXCLUDED."contentHash",
         "status" = 'READY',
         "processingError" = NULL,
         "vector" = EXCLUDED."vector",
         "updatedAt" = CURRENT_TIMESTAMP`,
      chunkId,
      provider,
      model,
      dimensions,
      contentHash,
      vectorLiteral(vector),
    );
  }

  async markFailed(chunkIds: string[], provider: string, model: string, message: string): Promise<void> {
    if (chunkIds.length === 0) {
      return;
    }

    const query = `UPDATE "embeddings"
      SET "status" = 'FAILED', "processingError" = $${chunkIds.length + 3}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "chunkId" IN (${placeholders(chunkIds.length)})
        AND "provider" = $${chunkIds.length + 1}
        AND "model" = $${chunkIds.length + 2}`;

    await prisma.$executeRawUnsafe(query, ...chunkIds, provider, model, message);
  }
}

export const embeddingRepository = new EmbeddingRepository();
