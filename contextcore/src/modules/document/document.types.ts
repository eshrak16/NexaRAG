import type { AuthUser } from '../auth/auth.types.js';

export const DOCUMENT_STATUSES = ['UPLOADED', 'PROCESSING', 'READY', 'FAILED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type DocumentSummary = {
  id: string;
  knowledgeBaseId: string;
  name: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  status: DocumentStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentListQuery = {
  userId: string;
  knowledgeBaseId: string;
  page?: number | undefined;
  limit?: number | undefined;
  search?: string | undefined;
  status?: DocumentStatus | undefined;
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    document?: {
      id: string;
      knowledgeBaseId: string;
      organizationId: string;
    };
  }
}
