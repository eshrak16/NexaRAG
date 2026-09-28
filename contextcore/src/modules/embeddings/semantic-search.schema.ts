import { z } from 'zod';

export const semanticSearchParamsSchema = z.object({
  knowledgeBaseId: z.string().trim().min(1, 'Knowledge base id is required.').max(100),
});

export const semanticSearchRequestSchema = z.object({
  query: z.string().trim().min(1, 'Query must not be empty.').max(4000, 'Query is too long.'),
  topK: z.coerce.number().int().min(1).max(20).default(5),
});

export type SemanticSearchRequest = z.infer<typeof semanticSearchRequestSchema>;
