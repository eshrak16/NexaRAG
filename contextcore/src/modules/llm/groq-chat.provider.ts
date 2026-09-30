import { env } from '../../config/env.js';
import { ChatCompletionProvider, ChatMessage, LlmConfigurationError, LlmProviderDiagnostics, LlmProviderError } from './llm.provider.js';

export type GroqChatConfiguration = {
  provider: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
  baseUrl: string;
  timeoutMs: number;
};

export type GroqChatProviderOptions = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
};

function fields(value: unknown): string[] {
  return value && typeof value === 'object' ? Object.keys(value).slice(0, 20) : [];
}

function safeTransportDiagnostics(error: unknown, endpoint: string): Pick<LlmProviderDiagnostics, 'causeName' | 'causeCode' | 'causeMessage'> {
  if (!error || typeof error !== 'object') return {};
  const outer = error as { name?: unknown; message?: unknown; cause?: unknown };
  const cause = outer.cause && typeof outer.cause === 'object' ? outer.cause as { code?: unknown; message?: unknown; name?: unknown } : undefined;
  const rawMessage = typeof cause?.message === 'string' ? cause.message : typeof outer.message === 'string' ? outer.message : undefined;
  const causeMessage = rawMessage
    ?.replaceAll(endpoint, '[configured provider endpoint]')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/(api[_ -]?key|token|password)\s*[:=]\s*[^\s,;"']+/gi, '$1=[redacted]')
    .slice(0, 240);
  return {
    ...(typeof (cause?.name ?? outer.name) === 'string' ? { causeName: String(cause?.name ?? outer.name).slice(0, 80) } : {}),
    ...(typeof cause?.code === 'string' ? { causeCode: cause.code.slice(0, 80) } : {}),
    ...(causeMessage ? { causeMessage } : {}),
  };
}

function parseCompletionContent(payload: unknown): string {
  const responseFields = fields(payload);
  if (!payload || typeof payload !== 'object' || !('choices' in payload)) {
    throw new LlmProviderError('INVALID_RESPONSE', { responseFields, contentExists: false });
  }

  const choices = (payload as { choices: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new LlmProviderError('INVALID_RESPONSE', { responseFields, contentExists: false });
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== 'object' || !('message' in firstChoice)) {
    throw new LlmProviderError('INVALID_RESPONSE', { responseFields, choiceFields: fields(firstChoice), contentExists: false });
  }

  const message = (firstChoice as { message: unknown }).message;
  if (!message || typeof message !== 'object' || !('content' in message)) {
    throw new LlmProviderError('INVALID_RESPONSE', { responseFields, choiceFields: fields(firstChoice), contentExists: false });
  }

  const content = (message as { content: unknown }).content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new LlmProviderError('INVALID_RESPONSE', {
      responseFields,
      choiceFields: fields(firstChoice),
      messageFields: fields(message),
      contentExists: content !== null && content !== undefined,
      contentType: content === null ? 'null' : typeof content,
    });
  }

  return content;
}

export function createConfiguredChatProvider(configuration: GroqChatConfiguration = {
  provider: env.LLM_PROVIDER,
  apiKey: env.LLM_API_KEY,
  model: env.LLM_MODEL,
  baseUrl: env.LLM_BASE_URL,
  timeoutMs: env.LLM_TIMEOUT_MS,
}): ChatCompletionProvider {
  if (
    (configuration.provider !== 'groq' && configuration.provider !== 'openai-compatible') ||
    !configuration.apiKey ||
    !configuration.model
  ) {
    throw new LlmConfigurationError();
  }

  return new GroqCompatibleChatProvider({
    apiKey: configuration.apiKey,
    baseUrl: configuration.baseUrl,
    model: configuration.model,
    timeoutMs: configuration.timeoutMs,
  });
}

export class GroqCompatibleChatProvider implements ChatCompletionProvider {
  readonly provider = 'groq';
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: GroqChatProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let response: Response;
      try {
        response = await this.fetchImplementation(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            temperature: 0,
            stream: false,
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'nexarag_answer',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    answer: { type: 'string', minLength: 1 },
                    citationRefs: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1 } },
                  },
                  required: ['answer', 'citationRefs'],
                  additionalProperties: false,
                },
              },
            },
          }),
          signal: controller.signal,
        });
      } catch (error) {
        throw new LlmProviderError(controller.signal.aborted ? 'TIMEOUT' : 'REQUEST_FAILED', {
          modelName: this.model,
          ...safeTransportDiagnostics(error, `${this.baseUrl}/chat/completions`),
        });
      }

      if (!response.ok) {
        const httpStatus = response.status;
        let providerErrorMessage: string | undefined;
        try {
          const body: unknown = await response.clone().json();
          if (body && typeof body === 'object' && 'error' in body) {
            const providerError = (body as { error: unknown }).error;
            if (providerError && typeof providerError === 'object' && 'message' in providerError && typeof providerError.message === 'string') {
              providerErrorMessage = providerError.message
                .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
                .replace(/(api[_ -]?key|token|password)\s*[:=]\s*[^\s,;"']+/gi, '$1=[redacted]')
                .slice(0, 300);
            }
          }
        } catch { /* Provider error bodies are optional and are never logged raw. */ }
        await response.body?.cancel().catch(() => undefined);
        throw new LlmProviderError('REQUEST_FAILED', {
          httpStatus,
          modelName: this.model,
          ...(providerErrorMessage ? { providerErrorMessage } : {}),
        });
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new LlmProviderError(controller.signal.aborted ? 'TIMEOUT' : 'INVALID_RESPONSE', {
          httpStatus: response.status,
          modelName: this.model,
          responseFields: [],
          contentExists: false,
        });
      }

      try {
        return parseCompletionContent(payload);
      } catch (error) {
        if (error instanceof LlmProviderError) {
          throw new LlmProviderError(error.code, { ...error.diagnostics, httpStatus: response.status, modelName: this.model });
        }
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
