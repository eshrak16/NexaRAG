import { prisma } from '../../database/prisma.js';
import { HttpAuthError } from '../auth/auth.service.js';
import { OrganizationRole } from '../organizations/organization.types.js';
import { KnowledgeBaseListQuery, KnowledgeBaseSummary } from './knowledgebase.types.js';

export type KnowledgeBaseCreateInput = {
  organizationId: string;
  name: string;
  description?: string | null | undefined;
};

export type KnowledgeBaseUpdateInput = {
  name?: string | undefined;
  description?: string | null | undefined;
};

export type KnowledgeBasePagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type KnowledgeBaseListResult = {
  data: KnowledgeBaseSummary[];
  pagination: KnowledgeBasePagination;
};

export class KnowledgeBaseService {
  async createKnowledgeBase(userId: string, input: KnowledgeBaseCreateInput): Promise<KnowledgeBaseSummary> {
    const membership = await this.getMembershipForUserByOrgId(input.organizationId, userId);

    if (!membership) {
      throw new HttpAuthError('FORBIDDEN', 'You do not have access to this organization.', 403);
    }

    if (membership.role === 'VIEWER') {
      throw new HttpAuthError('FORBIDDEN', 'VIEWER users cannot create knowledge bases.', 403);
    }

    const organization = await prisma.organization.findUnique({ where: { id: input.organizationId }, select: { id: true } });
    if (!organization) {
      throw new HttpAuthError('ORGANIZATION_NOT_FOUND', 'Organization not found.', 404);
    }

    const knowledgeBase = await prisma.knowledgeBase.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        description: input.description ?? null,
      },
    });

    return {
      id: knowledgeBase.id,
      organizationId: knowledgeBase.organizationId,
      name: knowledgeBase.name,
      description: knowledgeBase.description,
      createdAt: knowledgeBase.createdAt,
      updatedAt: knowledgeBase.updatedAt,
    };
  }

  async listKnowledgeBases({ userId, organizationId, page = 1, limit = 20, search }: KnowledgeBaseListQuery): Promise<KnowledgeBaseListResult> {
    const normalizedPage = Math.max(1, page ?? 1);
    const normalizedLimit = Math.min(100, Math.max(1, limit ?? 20));

    const organizationIds = await this.getAccessibleOrganizationIds(userId, organizationId);

    if (organizationIds.length === 0) {
      return {
        data: [],
        pagination: {
          page: normalizedPage,
          limit: normalizedLimit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const where = {
      organizationId: { in: organizationIds },
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    const [total, data] = await Promise.all([
      prisma.knowledgeBase.count({ where }),
      prisma.knowledgeBase.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
        skip: (normalizedPage - 1) * normalizedLimit,
        take: normalizedLimit,
      }),
    ]);

    return {
      data: data.map((knowledgeBase) => ({
        id: knowledgeBase.id,
        organizationId: knowledgeBase.organizationId,
        name: knowledgeBase.name,
        description: knowledgeBase.description,
        createdAt: knowledgeBase.createdAt,
        updatedAt: knowledgeBase.updatedAt,
      })),
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / normalizedLimit),
      },
    };
  }

  async getKnowledgeBaseForUser(knowledgeBaseId: string, userId: string): Promise<KnowledgeBaseSummary | null> {
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!knowledgeBase) {
      throw new HttpAuthError('KNOWLEDGE_BASE_NOT_FOUND', 'Knowledge base not found.', 404);
    }

    const membership = await this.getMembershipForUserByOrgId(knowledgeBase.organizationId, userId);
    if (!membership) {
      throw new HttpAuthError('FORBIDDEN', 'You do not have access to this knowledge base.', 403);
    }

    return {
      id: knowledgeBase.id,
      organizationId: knowledgeBase.organizationId,
      name: knowledgeBase.name,
      description: knowledgeBase.description,
      createdAt: knowledgeBase.createdAt,
      updatedAt: knowledgeBase.updatedAt,
    };
  }

  async updateKnowledgeBase(knowledgeBaseId: string, userId: string, input: KnowledgeBaseUpdateInput): Promise<KnowledgeBaseSummary> {
    const membership = await this.getMembershipForKnowledgeBase(knowledgeBaseId, userId);
    if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(membership.role)) {
      throw new HttpAuthError('FORBIDDEN', 'You do not have permission to update this knowledge base.', 403);
    }

    const knowledgeBase = await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });

    return {
      id: knowledgeBase.id,
      organizationId: knowledgeBase.organizationId,
      name: knowledgeBase.name,
      description: knowledgeBase.description,
      createdAt: knowledgeBase.createdAt,
      updatedAt: knowledgeBase.updatedAt,
    };
  }

  async deleteKnowledgeBase(knowledgeBaseId: string, userId: string): Promise<KnowledgeBaseSummary> {
    const membership = await this.getMembershipForKnowledgeBase(knowledgeBaseId, userId);
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new HttpAuthError('FORBIDDEN', 'You do not have permission to delete this knowledge base.', 403);
    }

    const knowledgeBase = await prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    if (!knowledgeBase) {
      throw new HttpAuthError('KNOWLEDGE_BASE_NOT_FOUND', 'Knowledge base not found.', 404);
    }

    const deleted = await prisma.knowledgeBase.delete({ where: { id: knowledgeBaseId } });

    return {
      id: deleted.id,
      organizationId: deleted.organizationId,
      name: deleted.name,
      description: deleted.description,
      createdAt: deleted.createdAt,
      updatedAt: deleted.updatedAt,
    };
  }

  async getMembershipForKnowledgeBase(knowledgeBaseId: string, userId: string): Promise<{ id: string; userId: string; role: OrganizationRole; organizationId: string } | null> {
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { organizationId: true },
    });

    if (!knowledgeBase) {
      return null;
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: knowledgeBase.organizationId,
        },
      },
      select: {
        id: true,
        userId: true,
        role: true,
        organizationId: true,
      },
    });

    return membership ?? null;
  }

  async getMembershipForUser(knowledgeBaseId: string, userId: string): Promise<{ id: string; userId: string; role: OrganizationRole; organizationId: string } | null> {
    return this.getMembershipForKnowledgeBase(knowledgeBaseId, userId);
  }

  private async getMembershipForUserByOrgId(organizationId: string, userId: string): Promise<{ id: string; userId: string; role: OrganizationRole; organizationId: string } | null> {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      select: {
        id: true,
        userId: true,
        role: true,
        organizationId: true,
      },
    });

    return membership ?? null;
  }

  private async getAccessibleOrganizationIds(userId: string, organizationId?: string): Promise<string[]> {
    if (organizationId) {
      const membership = await this.getMembershipForUserByOrgId(organizationId, userId);
      if (!membership) {
        throw new HttpAuthError('FORBIDDEN', 'You do not have access to this organization.', 403);
      }
      return [organizationId];
    }

    const memberships = await prisma.membership.findMany({
      where: { userId },
      select: { organizationId: true },
    });

    return memberships.map((membership) => membership.organizationId);
  }
}

export const knowledgeBaseService = new KnowledgeBaseService();
