-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "processingError" TEXT,
ADD COLUMN     "storagePath" TEXT;

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_chunks_documentId_chunkIndex_idx" ON "document_chunks"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "document_chunks_contentHash_idx" ON "document_chunks"("contentHash");

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
