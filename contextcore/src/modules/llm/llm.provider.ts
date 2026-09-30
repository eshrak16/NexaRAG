export type ChatMessage = {
  role: 'system' | 'user';
  content: string;
};

export interface ChatCompletionProvider {
  readonly provider: string;
  readonly model: string;
  complete(messages: ChatMessage[]): Promise<string>;
}

export type LlmProviderErrorCode = 'TIMEOUT' | 'REQUEST_FAILED' | 'INVALID_RESPONSE';

export type LlmProviderDiagnostics = {
  httpStatus?: number;
  responseFields?: string[];
  choiceFields?: string[];
  messageFields?: string[];
  contentExists?: boolean;
  contentType?: string;
  providerErrorMessage?: string;
  modelName?: string;
  causeName?: string;
  causeCode?: string;
  causeMessage?: string;
};

export class LlmProviderError extends Error {
  constructor(public readonly code: LlmProviderErrorCode, public readonly diagnostics?: LlmProviderDiagnostics) {
    super('The language model request could not be completed.');
    this.name = 'LlmProviderError';
  }
}

export class LlmConfigurationError extends Error {
  constructor() {
    super('Language model provider is not configured.');
    this.name = 'LlmConfigurationError';
  }
}
