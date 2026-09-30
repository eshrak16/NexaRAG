export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  user: { id: string; name: string; email: string };
};

export type KnowledgeBase = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
};

export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';

export type Document = {
  id: string;
  knowledgeBaseId: string;
  name: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
};

export type OrganizationMember = { userId: string; name: string; email: string; role: Organization['role']; createdAt: string; };
export type AdminRoleRequest = { id: string; organizationId: string; userId: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string; user: { id: string; name: string; email: string }; };
export type AuditEvent = { id: string; action: string; createdAt: string; actor: { id: string; name: string; email: string } | null; targetUserId: string | null; };

export type PageResult<T> = {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type AskResponse = {
  knowledgeBaseId: string;
  query: string;
  answer: string;
  citations: Array<{
    sourceRef: string;
    documentId: string;
    documentName: string;
    chunkId: string;
    chunkIndex: number;
  }>;
  retrieval: { provider: string; model: string; dimensions: number; topK: number; retrievedChunks: number };
  generation: { provider: string; model: string };
};

export type UploadResult = {
  id: string;
  status: DocumentStatus;
  contentHash: string;
  processingError?: string;
};
