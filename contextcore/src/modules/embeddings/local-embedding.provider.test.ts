import assert from 'node:assert/strict';
import test from 'node:test';

import { EmbeddingProviderError } from './embedding.provider.js';
import {
  BGE_SMALL_DIMENSIONS,
  BGE_SMALL_MODEL,
  LocalEmbeddingProvider,
  LocalFeatureExtractor,
} from './local-embedding.provider.js';

function provider(extractorFactory: () => Promise<LocalFeatureExtractor>): LocalEmbeddingProvider {
  return new LocalEmbeddingProvider({
    model: BGE_SMALL_MODEL,
    dimensions: BGE_SMALL_DIMENSIONS,
    extractorFactory,
  });
}

test('local provider batches input and returns 384-dimensional unit-normalized vectors', async () => {
  let seenTexts: string[] = [];
  let seenPooling: string | undefined;
  let seenNormalize: boolean | undefined;
  const extractor = (async (texts, options) => {
    seenTexts = texts;
    seenPooling = options.pooling;
    seenNormalize = options.normalize;
    return { tolist: () => texts.map(() => Array.from({ length: 384 }, () => 2)) };
  }) as LocalFeatureExtractor;

  const vectors = await provider(async () => extractor).embedTexts(['first chunk', 'second chunk']);

  assert.deepEqual(seenTexts, ['first chunk', 'second chunk']);
  assert.equal(seenPooling, 'mean');
  assert.equal(seenNormalize, true);
  assert.equal(vectors.length, 2);
  for (const vector of vectors) {
    assert.equal(vector.length, BGE_SMALL_DIMENSIONS);
    assert.ok(Math.abs(Math.sqrt(vector.reduce((sum, component) => sum + component * component, 0)) - 1) < 1e-10);
  }
});

test('local provider returns an empty batch without loading the model', async () => {
  let loads = 0;
  const instance = provider(async () => {
    loads += 1;
    throw new Error('should not load');
  });

  assert.deepEqual(await instance.embedTexts([]), []);
  assert.equal(loads, 0);
});

test('local provider rejects wrong batch counts, dimensions, and non-finite values', async () => {
  const wrongCount = provider(async () => (async () => ({ tolist: () => [] })) as LocalFeatureExtractor);
  const wrongDimensions = provider(async () => (async () => ({ tolist: () => [[1, 2, 3]] })) as LocalFeatureExtractor);
  const nonFinite = provider(async () => (async () => ({ tolist: () => [Array.from({ length: 384 }, () => Number.NaN)] })) as LocalFeatureExtractor);

  await assert.rejects(() => wrongCount.embedTexts(['text']), EmbeddingProviderError);
  await assert.rejects(() => wrongDimensions.embedTexts(['text']), EmbeddingProviderError);
  await assert.rejects(() => nonFinite.embedTexts(['text']), EmbeddingProviderError);
});

test('local provider classifies model loading and inference errors safely', async () => {
  const loadFailure = provider(async () => { throw new Error('internal model path'); });
  const inferenceFailure = provider(async () => (async () => { throw new Error('internal inference details'); }) as LocalFeatureExtractor);

  await assert.rejects(
    () => loadFailure.embedTexts(['text']),
    (error) => error instanceof EmbeddingProviderError && error.transient && !error.message.includes('internal'),
  );
  await assert.rejects(
    () => inferenceFailure.embedTexts(['text']),
    (error) => error instanceof EmbeddingProviderError && !error.transient && !error.message.includes('internal'),
  );
});

test('local provider rejects model or dimension mismatches at construction', () => {
  assert.throws(() => new LocalEmbeddingProvider({ model: 'all-MiniLM-L6-v2', dimensions: 384 }));
  assert.throws(() => new LocalEmbeddingProvider({ model: BGE_SMALL_MODEL, dimensions: 1536 }));
});
