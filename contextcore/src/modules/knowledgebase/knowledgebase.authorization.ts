import { FastifyReply, FastifyRequest } from 'fastify';

import { HttpAuthError } from '../auth/auth.service.js';
import { OrganizationRole } from '../organizations/organization.types.js';
import { can, OrganizationPermission } from '../organizations/permissions.js';
import { knowledgeBaseService } from './knowledgebase.service.js';

export async function requireKnowledgeBaseMembership(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.user) {
    throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
  }

  const knowledgeBaseId = (request.params as { id?: string; knowledgeBaseId?: string })?.id ?? (request.params as { knowledgeBaseId?: string }).knowledgeBaseId;

  if (!knowledgeBaseId) {
    throw new HttpAuthError('KNOWLEDGE_BASE_ID_REQUIRED', 'Knowledge base id is required.', 400);
  }

  const membership = await knowledgeBaseService.getMembershipForUser(knowledgeBaseId, request.user.id);

  if (!membership) {
    throw new HttpAuthError('FORBIDDEN', 'You do not have access to this knowledge base.', 403);
  }

  request.knowledgeBase = { id: knowledgeBaseId, organizationId: membership.organizationId };
  request.organization = { id: membership.organizationId, role: membership.role };
  request.membership = {
    id: membership.id,
    userId: membership.userId,
    organizationId: membership.organizationId,
    role: membership.role,
  };
}

export function requireKnowledgeBaseRole(allowedRoles: OrganizationRole[]) {
  return async function roleGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) {
      throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
    }

    const knowledgeBaseId = (request.params as { id?: string; knowledgeBaseId?: string })?.id ?? (request.params as { knowledgeBaseId?: string }).knowledgeBaseId;

    if (!knowledgeBaseId) {
      throw new HttpAuthError('KNOWLEDGE_BASE_ID_REQUIRED', 'Knowledge base id is required.', 400);
    }

    const membership = await knowledgeBaseService.getMembershipForUser(knowledgeBaseId, request.user.id);

    if (!membership || !allowedRoles.includes(membership.role)) {
      throw new HttpAuthError('FORBIDDEN', 'You do not have permission to perform this action.', 403);
    }

    request.knowledgeBase = { id: knowledgeBaseId, organizationId: membership.organizationId };
    request.organization = { id: membership.organizationId, role: membership.role };
    request.membership = {
      id: membership.id,
      userId: membership.userId,
      organizationId: membership.organizationId,
      role: membership.role,
    };
  };
}

export function requireKnowledgeBasePermission(permission: OrganizationPermission) {
  return async function permissionGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
    const knowledgeBaseId = (request.params as { id?: string; knowledgeBaseId?: string })?.id ?? (request.params as { knowledgeBaseId?: string }).knowledgeBaseId;
    if (!knowledgeBaseId) throw new HttpAuthError('KNOWLEDGE_BASE_ID_REQUIRED', 'Knowledge base id is required.', 400);
    const membership = await knowledgeBaseService.getMembershipForUser(knowledgeBaseId, request.user.id);
    if (!membership || !can(membership.role, permission)) throw new HttpAuthError('FORBIDDEN', 'You do not have permission to perform this action.', 403);
    request.knowledgeBase = { id: knowledgeBaseId, organizationId: membership.organizationId };
    request.organization = { id: membership.organizationId, role: membership.role };
    request.membership = { id: membership.id, userId: membership.userId, organizationId: membership.organizationId, role: membership.role };
  };
}
