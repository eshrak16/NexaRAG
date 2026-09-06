import type { AuthUser } from '../auth/auth.types.js';

export type KnowledgeBaseSummary = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type KnowledgeBaseListQuery = {
  userId: string;
  organizationId?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  search?: string | undefined;
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    knowledgeBase?: {
      id: string;
      organizationId: string;
    };
  }
}
