import { HttpAuthError } from '../auth/auth.service.js';
import { knowledgeBaseService, KnowledgeBaseService } from '../knowledgebase/knowledgebase.service.js';
import { EmbeddingProvider } from './embedding.provider.js';
import { BGE_SMALL_DIMENSIONS, BGE_SMALL_MODEL } from './local-embedding.provider.js';
import { createConfiguredProvider } from './embedding.service.js';
import { embeddingRepository, EmbeddingRepository, SimilaritySearchHit } from './embedding.repository.js';

export type SemanticSearchResult = {
  knowledgeBaseId: string;
  provider: string;
  model: string;
  dimensions: number;
  topK: number;
  results: SimilaritySearchHit[];
};

type SemanticSearchRepository = Pick<EmbeddingRepository, 'searchSimilarChunks'>;
type KnowledgeBaseAuthorizer = Pick<KnowledgeBaseService, 'getKnowledgeBaseForUser'>;

function unavailableError(): HttpAuthError {
  return new HttpAuthError('EMBEDDING_UNAVAILABLE', 'Semantic search is temporarily unavailable.', 503);
}

function validVector(vector: number[]): boolean {
  return vector.length === BGE_SMALL_DIMENSIONS && vector.every(Number.isFinite);
}

export class SemanticSearchService {
  constructor(
    private readonly providerFactory: () => EmbeddingProvider = createConfiguredProvider,
    private readonly repository: SemanticSearchRepository = embeddingRepository,
    private readonly knowledgeBases: KnowledgeBaseAuthorizer = knowledgeBaseService,
  ) {}

  async searchKnowledgeBase(
    knowledgeBaseId: string,
    userId: string,
    query: string,
    topK: number,
  ): Promise<SemanticSearchResult> {
    // Authorize before loading the embedding model or retrieving any chunk content.
    await this.knowledgeBases.getKnowledgeBaseForUser(knowledgeBaseId, userId);

    let provider: EmbeddingProvider;
    try {
      provider = this.providerFactory();
    } catch {
      throw unavailableError();
    }

    if (
      provider.provider !== 'local' ||
      provider.model !== BGE_SMALL_MODEL ||
      provider.dimensions !== BGE_SMALL_DIMENSIONS
    ) {
      throw unavailableError();
    }

    let vectors: number[][];
    try {
      vectors = await provider.embedTexts([query]);
    } catch {
      throw unavailableError();
    }

    const vector = vectors[0];
    if (vectors.length !== 1 || !vector || !validVector(vector)) {
      throw unavailableError();
    }

    let results: SimilaritySearchHit[];
    try {
      results = await this.repository.searchSimilarChunks(
        vector,
        knowledgeBaseId,
        provider.provider,
        provider.model,
        provider.dimensions,
        topK,
      );
    } catch {
      throw unavailableError();
    }

    return {
      knowledgeBaseId,
      provider: provider.provider,
      model: provider.model,
      dimensions: provider.dimensions,
      topK,
      results,
    };
  }
}

export const semanticSearchService = new SemanticSearchService();
