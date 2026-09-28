import type { EmbeddingProvider } from './embedding.provider.js';
import { EmbeddingProviderError } from './embedding.provider.js';

export const BGE_SMALL_MODEL = 'BAAI/bge-small-en-v1.5';
export const BGE_SMALL_TRANSFORMERS_MODEL = 'Xenova/bge-small-en-v1.5';
export const BGE_SMALL_DIMENSIONS = 384;

type FeatureTensor = {
  tolist: () => unknown;
};

export type LocalFeatureExtractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: true },
) => Promise<FeatureTensor>;

export type LocalEmbeddingProviderOptions = {
  model: string;
  dimensions: number;
  extractorFactory?: (() => Promise<LocalFeatureExtractor>) | undefined;
};

async function createExtractor(): Promise<LocalFeatureExtractor> {
  const { pipeline } = await import('@huggingface/transformers');
  const extractor = await pipeline('feature-extraction', BGE_SMALL_TRANSFORMERS_MODEL, { device: 'cpu' });
  return extractor as unknown as LocalFeatureExtractor;
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, component) => sum + component * component, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new EmbeddingProviderError('Local embedding model returned a zero or invalid vector.', false);
  }
  return vector.map((component) => component / magnitude);
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly provider = 'local';
  readonly model: string;
  readonly dimensions: number;

  private readonly extractorFactory: () => Promise<LocalFeatureExtractor>;
  private extractorPromise: Promise<LocalFeatureExtractor> | undefined;

  constructor(options: LocalEmbeddingProviderOptions) {
    if (options.model !== BGE_SMALL_MODEL) {
      throw new Error(`Local embedding model must be ${BGE_SMALL_MODEL}.`);
    }
    if (options.dimensions !== BGE_SMALL_DIMENSIONS) {
      throw new Error(`Local embedding dimensions must be ${BGE_SMALL_DIMENSIONS}.`);
    }

    this.model = options.model;
    this.dimensions = options.dimensions;
    this.extractorFactory = options.extractorFactory ?? createExtractor;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    let extractor: LocalFeatureExtractor;
    try {
      extractor = await (this.extractorPromise ??= this.extractorFactory().catch((error: unknown) => {
        this.extractorPromise = undefined;
        throw error;
      }));
    } catch {
      throw new EmbeddingProviderError('Unable to load the local embedding model.', true);
    }

    let output: unknown;
    try {
      const tensor = await extractor(texts, { pooling: 'mean', normalize: true });
      output = tensor.tolist();
    } catch (error) {
      if (error instanceof EmbeddingProviderError) {
        throw error;
      }
      throw new EmbeddingProviderError('Local embedding inference failed.', false);
    }

    if (!Array.isArray(output) || output.length !== texts.length) {
      throw new EmbeddingProviderError('Local embedding model returned an invalid vector count.', false);
    }

    return output.map((value) => {
      if (
        !Array.isArray(value)
        || value.length !== this.dimensions
        || value.some((component) => typeof component !== 'number' || !Number.isFinite(component))
      ) {
        throw new EmbeddingProviderError('Local embedding model returned an invalid vector dimension or value.', false);
      }
      return normalize(value as number[]);
    });
  }
}
