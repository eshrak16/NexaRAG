export type EmbeddingProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: number;
};

export type EmbeddingProvider = {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  embedTexts(texts: string[]): Promise<number[][]>;
};

export class EmbeddingProviderError extends Error {
  readonly transient: boolean;

  constructor(message: string, transient: boolean) {
    super(message);
    this.name = 'EmbeddingProviderError';
    this.transient = transient;
  }
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function validateVectors(value: unknown, expectedCount: number, dimensions: number): number[][] {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new EmbeddingProviderError('Embedding provider returned an invalid vector count.', false);
  }

  const vectors = value.map((item) => {
    if (!Array.isArray(item) || item.length !== dimensions || item.some((component) => typeof component !== 'number' || !Number.isFinite(component))) {
      throw new EmbeddingProviderError('Embedding provider returned an invalid vector dimension or value.', false);
    }
    return item as number[];
  });

  return vectors;
}

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly provider = 'openai-compatible';
  readonly model: string;
  readonly dimensions: number;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(config: EmbeddingProviderConfig, fetchImplementation: typeof fetch = fetch) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.dimensions = config.dimensions;
    this.fetchImplementation = fetchImplementation;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    let response: Response;
    try {
      response = await this.fetchImplementation(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ input: texts, model: this.model }),
      });
    } catch {
      throw new EmbeddingProviderError('Embedding provider request failed.', true);
    }

    if (!response.ok) {
      throw new EmbeddingProviderError('Embedding provider returned an error response.', isTransientStatus(response.status));
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new EmbeddingProviderError('Embedding provider returned malformed JSON.', false);
    }

    if (!payload || typeof payload !== 'object' || !('data' in payload)) {
      throw new EmbeddingProviderError('Embedding provider response is missing data.', false);
    }

    const data = (payload as { data: unknown }).data;
    if (!Array.isArray(data)) {
      throw new EmbeddingProviderError('Embedding provider response data is invalid.', false);
    }

    const orderedEmbeddings = data
      .map((item) => (item && typeof item === 'object' && 'embedding' in item ? (item as { embedding: unknown }).embedding : undefined));

    return validateVectors(orderedEmbeddings, texts.length, this.dimensions);
  }
}
