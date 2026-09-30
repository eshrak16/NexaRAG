import { FastifyReply, FastifyRequest } from 'fastify';

import { HttpAuthError } from '../auth/auth.service.js';
import { organizationService } from './organization.service.js';
import { OrganizationRole } from './organization.types.js';
import { can, OrganizationPermission } from './permissions.js';

export async function requireOrganizationMembership(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.user) {
    throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
  }

  const organizationId = (request.params as { id?: string })?.id;

  if (!organizationId) {
    throw new HttpAuthError('ORGANIZATION_ID_REQUIRED', 'Organization id is required.', 400);
  }

  const membership = await organizationService.getMembership(organizationId, request.user.id);

  if (!membership) {
    throw new HttpAuthError('FORBIDDEN', 'You do not have access to this organization.', 403);
  }

  request.membership = membership;
  request.organization = {
    id: organizationId,
    role: membership.role,
  };
}

export function requireOrganizationRole(allowedRoles: OrganizationRole[]) {
  return async function roleGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) {
      throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
    }

    const organizationId = (request.params as { id?: string })?.id;

    if (!organizationId) {
      throw new HttpAuthError('ORGANIZATION_ID_REQUIRED', 'Organization id is required.', 400);
    }

    const membership = await organizationService.getMembership(organizationId, request.user.id);

    if (!membership || !allowedRoles.includes(membership.role)) {
      throw new HttpAuthError('FORBIDDEN', 'You do not have permission to perform this action.', 403);
    }

    request.membership = membership;
    request.organization = {
      id: organizationId,
      role: membership.role,
    };
  };
}

export function requireOrganizationPermission(permission: OrganizationPermission | 'organization:update' | 'organization:members:manage') {
  return async function permissionGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) throw new HttpAuthError('UNAUTHENTICATED', 'Authentication required.', 401);
    const organizationId = (request.params as { id?: string })?.id;
    if (!organizationId) throw new HttpAuthError('ORGANIZATION_ID_REQUIRED', 'Organization id is required.', 400);
    const membership = await organizationService.getMembership(organizationId, request.user.id);
    const permitted = membership && (permission === 'organization:update'
      ? membership.role === 'OWNER'
      : permission === 'organization:members:manage'
        ? membership.role === 'OWNER' || membership.role === 'ADMIN'
        : can(membership.role, permission));
    if (!permitted || !membership) throw new HttpAuthError('FORBIDDEN', 'You do not have permission to perform this action.', 403);
    request.membership = membership;
    request.organization = { id: organizationId, role: membership.role };
  };
}
