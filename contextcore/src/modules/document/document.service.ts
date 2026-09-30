import { prisma } from '../../database/prisma.js';
import { HttpAuthError } from '../auth/auth.service.js';
import { OrganizationRole } from '../organizations/organization.types.js';
import { can } from '../organizations/permissions.js';
import { knowledgeBaseService } from '../knowledgebase/knowledgebase.service.js';
import { DocumentListQuery, DocumentSummary } from './document.types.js';

export type DocumentCreateInput = {
  name: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  status?: 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED' | undefined;
};

export type DocumentUpdateInput = {
  name?: string | undefined;
  originalFileName?: string | undefined;
  mimeType?: string | undefined;
  fileSize?: number | undefined;
  status?: 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED' | undefined;
};

export type DocumentPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type DocumentListResult = {
  data: DocumentSummary[];
  pagination: DocumentPagination;
};

export class DocumentService {
  async createDocument(userId: string, knowledgeBaseId: string, input: DocumentCreateInput): Promise<DocumentSummary> {
    const membership = await knowledgeBaseService.getMembershipForKnowledgeBase(knowledgeBaseId, userId);
    if (!membership) {
      throw new HttpAuthError('FORBIDDEN', 'You do not have access to this knowledge base.', 403);
    }

    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { id: true },
    });

    if (!knowledgeBase) {
      throw new HttpAuthError('KNOWLEDGE_BASE_NOT_FOUND', 'Knowledge base not found.', 404);
    }

    const document = await prisma.document.create({
      data: {
        knowledgeBaseId,
        name: input.name,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        status: input.status ?? 'UPLOADED',
      },
    });

    return {
      id: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      name: document.name,
      originalFileName: document.originalFileName,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      status: document.status,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  async listDocuments({ userId, knowledgeBaseId, page = 1, limit = 20, search, status }: DocumentListQuery): Promise<DocumentListResult> {
    const membership = await knowledgeBaseService.getMembershipForKnowledgeBase(knowledgeBaseId, userId);
    if (!membership) {
      throw new HttpAuthError('FORBIDDEN', 'You do not have access to this knowledge base.', 403);
    }

    const normalizedPage = Math.max(1, page ?? 1);
    const normalizedLimit = Math.min(100, Math.max(1, limit ?? 20));

    const where = {
      knowledgeBaseId,
      ...(status ? { status } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { originalFileName: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    const [total, data] = await Promise.all([
      prisma.document.count({ where }),
      prisma.document.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
        skip: (normalizedPage - 1) * normalizedLimit,
        take: normalizedLimit,
      }),
    ]);

    return {
      data: data.map((document) => ({
        id: document.id,
        knowledgeBaseId: document.knowledgeBaseId,
        name: document.name,
        originalFileName: document.originalFileName,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        status: document.status,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      })),
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / normalizedLimit),
      },
    };
  }

  async getDocumentForUser(documentId: string, userId: string): Promise<DocumentSummary | null> {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new HttpAuthError('DOCUMENT_NOT_FOUND', 'Document not found.', 404);
    }

    const membership = await knowledgeBaseService.getMembershipForKnowledgeBase(document.knowledgeBaseId, userId);
    if (!membership) {
      throw new HttpAuthError('FORBIDDEN', 'You do not have access to this document.', 403);
    }

    return {
      id: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      name: document.name,
      originalFileName: document.originalFileName,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      status: document.status,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  async updateDocument(documentId: string, userId: string, input: DocumentUpdateInput): Promise<DocumentSummary> {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new HttpAuthError('DOCUMENT_NOT_FOUND', 'Document not found.', 404);
    }

    const membership = await knowledgeBaseService.getMembershipForKnowledgeBase(document.knowledgeBaseId, userId);
    if (!membership || !can(membership.role, 'document:update')) {
      throw new HttpAuthError('FORBIDDEN', 'You do not have permission to update this document.', 403);
    }

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.originalFileName !== undefined ? { originalFileName: input.originalFileName } : {}),
        ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
        ...(input.fileSize !== undefined ? { fileSize: input.fileSize } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    return {
      id: updated.id,
      knowledgeBaseId: updated.knowledgeBaseId,
      name: updated.name,
      originalFileName: updated.originalFileName,
      mimeType: updated.mimeType,
      fileSize: updated.fileSize,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteDocument(documentId: string, userId: string): Promise<DocumentSummary> {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new HttpAuthError('DOCUMENT_NOT_FOUND', 'Document not found.', 404);
    }

    const membership = await knowledgeBaseService.getMembershipForKnowledgeBase(document.knowledgeBaseId, userId);
    if (!membership || !can(membership.role, 'document:delete')) {
      throw new HttpAuthError('FORBIDDEN', 'You do not have permission to delete this document.', 403);
    }

    const deleted = await prisma.document.delete({ where: { id: documentId } });
    return {
      id: deleted.id,
      knowledgeBaseId: deleted.knowledgeBaseId,
      name: deleted.name,
      originalFileName: deleted.originalFileName,
      mimeType: deleted.mimeType,
      fileSize: deleted.fileSize,
      status: deleted.status,
      createdAt: deleted.createdAt,
      updatedAt: deleted.updatedAt,
    };
  }

  async getKnowledgeBaseRole(userId: string, knowledgeBaseId: string): Promise<{ id: string; userId: string; role: OrganizationRole; organizationId: string } | null> {
    return knowledgeBaseService.getMembershipForKnowledgeBase(knowledgeBaseId, userId);
  }
}

export const documentService = new DocumentService();
