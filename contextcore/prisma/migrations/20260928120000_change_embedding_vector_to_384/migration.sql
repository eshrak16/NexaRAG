BEGIN;

DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM "embeddings" WHERE "vector" IS NOT NULL) THEN
        RAISE EXCEPTION
            'Non-NULL embedding vectors exist; preserve or migrate them before changing vector dimensions';
    END IF;
END;
$migration$;

DROP INDEX IF EXISTS "embeddings_vector_hnsw_cosine_idx";

ALTER TABLE "embeddings"
    ALTER COLUMN "vector" TYPE vector(384)
    USING "vector"::vector(384);

CREATE INDEX "embeddings_vector_hnsw_cosine_idx"
    ON "embeddings" USING hnsw ("vector" vector_cosine_ops)
    WHERE "vector" IS NOT NULL;

COMMIT;
