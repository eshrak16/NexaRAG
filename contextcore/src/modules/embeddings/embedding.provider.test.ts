import assert from 'node:assert/strict';
import test from 'node:test';

import { EmbeddingProviderError, OpenAICompatibleEmbeddingProvider } from './embedding.provider.js';

function provider(fetchImplementation: typeof fetch): OpenAICompatibleEmbeddingProvider {
  return new OpenAICompatibleEmbeddingProvider({
    apiKey: 'test-key',
    baseUrl: 'https://embedding.test/v1',
    model: 'test-model',
    dimensions: 3,
  }, fetchImplementation);
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('OpenAI-compatible provider returns one vector per input in response order', async () => {
  let requestBody: { input: string[]; model: string } | undefined;
  const fetchImplementation = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as { input: string[]; model: string };
    return response({ data: [{ embedding: [1, 2, 3] }, { embedding: [4, 5, 6] }] });
  }) as typeof fetch;

  const vectors = await provider(fetchImplementation).embedTexts(['first', 'second']);

  assert.deepEqual(vectors, [[1, 2, 3], [4, 5, 6]]);
  assert.deepEqual(requestBody, { input: ['first', 'second'], model: 'test-model' });
});

test('provider rejects count mismatch', async () => {
  const fetchImplementation = (async () => response({ data: [{ embedding: [1, 2, 3] }] })) as typeof fetch;

  await assert.rejects(
    () => provider(fetchImplementation).embedTexts(['first', 'second']),
    (error) => error instanceof EmbeddingProviderError && !error.transient,
  );
});

test('provider rejects invalid vector dimensions and malformed responses', async () => {
  const wrongDimensions = (async () => response({ data: [{ embedding: [1, 2] }] })) as typeof fetch;
  const malformed = (async () => response({ result: [] })) as typeof fetch;

  await assert.rejects(() => provider(wrongDimensions).embedTexts(['first']), EmbeddingProviderError);
  await assert.rejects(() => provider(malformed).embedTexts(['first']), EmbeddingProviderError);
});

test('provider classifies transient and permanent HTTP failures', async () => {
  const transient = (async () => response({}, 429)) as typeof fetch;
  const permanent = (async () => response({}, 400)) as typeof fetch;

  await assert.rejects(
    () => provider(transient).embedTexts(['first']),
    (error) => error instanceof EmbeddingProviderError && error.transient,
  );
  await assert.rejects(
    () => provider(permanent).embedTexts(['first']),
    (error) => error instanceof EmbeddingProviderError && !error.transient,
  );
});
