import { prisma } from '../../database/prisma.js';
import { HttpAuthError } from '../auth/auth.service.js';
import type { OrganizationRole } from './organization.types.js';
import { can } from './permissions.js';

export class AdminService {
  private async requirePermission(organizationId: string, actorId: string, permission: 'admin:request' | 'admin:approve' | 'member:read' | 'audit:view') {
    const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: actorId, organizationId } } });
    if (!membership || !can(membership.role as OrganizationRole, permission)) throw new HttpAuthError('FORBIDDEN', 'You do not have permission to perform this action.', 403);
    return membership;
  }

  async requestAdmin(organizationId: string, actorId: string) {
    const membership = await this.requirePermission(organizationId, actorId, 'admin:request');
    if (membership.role === 'OWNER' || membership.role === 'ADMIN') throw new HttpAuthError('INVALID_ROLE_REQUEST', 'Only a MEMBER or VIEWER can request Admin access.', 409);
    const pending = await prisma.adminRoleRequest.findFirst({ where: { organizationId, userId: actorId, status: 'PENDING' } });
    if (pending) throw new HttpAuthError('REQUEST_ALREADY_PENDING', 'An Admin access request is already pending.', 409);
    try {
      return await prisma.adminRoleRequest.create({ data: { organizationId, userId: actorId } });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new HttpAuthError('REQUEST_ALREADY_PENDING', 'An Admin access request is already pending.', 409);
      throw error;
    }
  }

  async listRequests(organizationId: string, actorId: string) {
    await this.requirePermission(organizationId, actorId, 'admin:approve');
    return prisma.adminRoleRequest.findMany({ where: { organizationId }, include: { user: { select: { id: true, name: true, email: true } }, reviewedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async reviewRequest(organizationId: string, requestId: string, actorId: string, approve: boolean) {
    const actor = await this.requirePermission(organizationId, actorId, 'admin:approve');
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.adminRoleRequest.findFirst({ where: { id: requestId, organizationId, status: 'PENDING' } });
      if (!request) throw new HttpAuthError('REQUEST_NOT_PENDING', 'The Admin access request was not found or has already been reviewed.', 404);
      if (request.userId === actorId) throw new HttpAuthError('SELF_APPROVAL_DENIED', 'You cannot review your own Admin access request.', 403);
      if (approve) {
        const target = await tx.membership.findUnique({ where: { userId_organizationId: { userId: request.userId, organizationId } } });
        if (!target || target.role === 'OWNER' || target.role === 'ADMIN') throw new HttpAuthError('INVALID_ROLE_REQUEST', 'This member can no longer be promoted to Admin.', 409);
        await tx.membership.update({ where: { userId_organizationId: { userId: request.userId, organizationId } }, data: { role: 'ADMIN' } });
      }
      const updated = await tx.adminRoleRequest.update({ where: { id: request.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', reviewedById: actorId, reviewedAt: new Date() } });
      await tx.auditEvent.create({ data: { organizationId, actorId, targetUserId: request.userId, action: approve ? 'ADMIN_REQUEST_APPROVED' : 'ADMIN_REQUEST_REJECTED', details: { requestId: request.id } } });
      return updated;
    });
    return result;
  }

  async listAuditEvents(organizationId: string, actorId: string) {
    await this.requirePermission(organizationId, actorId, 'audit:view');
    return prisma.auditEvent.findMany({ where: { organizationId }, include: { actor: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
}

export const adminService = new AdminService();
