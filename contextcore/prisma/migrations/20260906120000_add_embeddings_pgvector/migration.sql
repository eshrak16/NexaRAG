-- Enable pgvector for fixed 1536-dimensional cosine embeddings.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "EmbeddingStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE "embeddings" (
    "id" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "EmbeddingStatus" NOT NULL DEFAULT 'PENDING',
    "processingError" TEXT,
    "vector" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "embeddings_chunkId_provider_model_key"
    ON "embeddings"("chunkId", "provider", "model");

CREATE INDEX "embeddings_chunkId_idx" ON "embeddings"("chunkId");
CREATE INDEX "embeddings_provider_model_idx" ON "embeddings"("provider", "model");
CREATE INDEX "embeddings_contentHash_idx" ON "embeddings"("contentHash");
CREATE INDEX "embeddings_status_idx" ON "embeddings"("status");

CREATE INDEX "embeddings_vector_hnsw_cosine_idx"
    ON "embeddings" USING hnsw ("vector" vector_cosine_ops)
    WHERE "vector" IS NOT NULL;

ALTER TABLE "embeddings"
    ADD CONSTRAINT "embeddings_chunkId_fkey"
    FOREIGN KEY ("chunkId") REFERENCES "document_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
