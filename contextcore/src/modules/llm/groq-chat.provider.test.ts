import assert from 'node:assert/strict';
import test from 'node:test';

import { createConfiguredChatProvider, GroqCompatibleChatProvider } from './groq-chat.provider.js';
import { LlmConfigurationError, LlmProviderError } from './llm.provider.js';

function provider(fetchImplementation: typeof fetch, timeoutMs = 1000): GroqCompatibleChatProvider {
  return new GroqCompatibleChatProvider({
    apiKey: 'mock-api-key',
    baseUrl: 'https://groq.test/openai/v1/',
    model: 'mock-model',
    timeoutMs,
    fetchImplementation,
  });
}

test('Groq-compatible provider parses a successful completion without exposing credentials', async () => {
  let requestUrl = '';
  let requestHeaders: Record<string, string> | undefined;
  let requestBody: { model: string; messages: unknown[]; response_format?: { type: string; json_schema?: { name: string; strict: boolean; schema: unknown } } } | undefined;
  const fetchImplementation = (async (input, init) => {
    requestUrl = String(input);
    requestHeaders = init?.headers as Record<string, string> | undefined;
    requestBody = JSON.parse(String(init?.body)) as { model: string; messages: unknown[] };
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"Grounded.","citationRefs":["S1"]}' } }] }), { status: 200 });
  }) as typeof fetch;

  const completion = await provider(fetchImplementation).complete([{ role: 'user', content: 'question' }]);

  assert.equal(requestUrl, 'https://groq.test/openai/v1/chat/completions');
  assert.equal(requestHeaders?.authorization, 'Bearer mock-api-key');
  assert.equal(requestBody?.model, 'mock-model');
  assert.equal(requestBody?.response_format?.type, 'json_schema');
  assert.equal(requestBody?.response_format?.json_schema?.name, 'nexarag_answer');
  assert.equal(requestBody?.response_format?.json_schema?.strict, true);
  assert.deepEqual(requestBody?.response_format?.json_schema?.schema, {
    type: 'object',
    properties: { answer: { type: 'string', minLength: 1 }, citationRefs: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1 } } },
    required: ['answer', 'citationRefs'],
    additionalProperties: false,
  });
  assert.equal(completion, '{"answer":"Grounded.","citationRefs":["S1"]}');
});

test('Groq-compatible provider reports timeout and provider failures safely', async () => {
  const slowFetch = ((_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('internal timeout detail')));
  })) as typeof fetch;
  const failedFetch = (async () => new Response(JSON.stringify({ error: { message: 'secret provider detail' } }), { status: 503 })) as typeof fetch;

  await assert.rejects(
    () => provider(slowFetch, 5).complete([{ role: 'user', content: 'question' }]),
    (error) => error instanceof LlmProviderError && error.code === 'TIMEOUT' && !error.message.includes('internal'),
  );
  await assert.rejects(
    () => provider(failedFetch).complete([{ role: 'user', content: 'question' }]),
    (error) => error instanceof LlmProviderError && error.code === 'REQUEST_FAILED' && error.diagnostics?.httpStatus === 503 && error.diagnostics.providerErrorMessage === 'secret provider detail' && !error.message.includes('secret'),
  );
});

test('Groq-compatible provider keeps safe transport diagnostics without logging endpoint credentials', async () => {
  const networkFailure = (async () => {
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect to https://groq.test/openai/v1/chat/completions failed'), { code: 'EAI_AGAIN' }) });
  }) as typeof fetch;
  await assert.rejects(
    () => provider(networkFailure).complete([{ role: 'user', content: 'question' }]),
    (error) => error instanceof LlmProviderError && error.code === 'REQUEST_FAILED'
      && error.diagnostics?.causeCode === 'EAI_AGAIN'
      && error.diagnostics.causeMessage === 'connect to [configured provider endpoint] failed',
  );
});

test('Groq-compatible provider rejects malformed responses and missing configuration', async () => {
  const malformedFetch = (async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })) as typeof fetch;
  await assert.rejects(
    () => provider(malformedFetch).complete([{ role: 'user', content: 'question' }]),
    (error) => error instanceof LlmProviderError && error.code === 'INVALID_RESPONSE',
  );

  assert.throws(() => createConfiguredChatProvider({
    provider: undefined,
    apiKey: undefined,
    model: undefined,
    baseUrl: 'https://groq.test/openai/v1',
    timeoutMs: 1000,
  }), LlmConfigurationError);
});
