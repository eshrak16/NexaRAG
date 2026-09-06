-- AlterTable
ALTER TABLE "document_chunks"
ADD COLUMN "characterEnd" INTEGER,
ADD COLUMN "characterStart" INTEGER,
ADD COLUMN "chunkingVersion" TEXT,
ADD COLUMN "estimatedTokenCount" INTEGER;

-- Backfill existing chunks using the same deterministic metadata contract as the application.
UPDATE "document_chunks"
SET
  "characterStart" = 0,
  "characterEnd" = char_length("content"),
  "estimatedTokenCount" = GREATEST(1, CEIL(char_length("content") / 4.0))::INTEGER,
  "chunkingVersion" = 'v1';

-- Enforce metadata for all current and future chunks.
ALTER TABLE "document_chunks"
ALTER COLUMN "characterEnd" SET NOT NULL,
ALTER COLUMN "characterStart" SET NOT NULL,
ALTER COLUMN "chunkingVersion" SET NOT NULL,
ALTER COLUMN "estimatedTokenCount" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_documentId_chunkIndex_key" ON "document_chunks"("documentId", "chunkIndex");
