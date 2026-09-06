import { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { prisma } from '../../database/prisma.js';
import { HttpAuthError } from '../auth/auth.service.js';
import { AuthUser } from '../auth/auth.types.js';
import { OrganizationMembership, OrganizationRole, OrganizationSummary } from './organization.types.js';

export class OrganizationService {
  async createOrganization(user: AuthUser, name: string): Promise<{ id: string; name: string; slug: string; role: OrganizationRole }> {
    const slug = await this.generateUniqueSlug(name);

    return prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name,
          slug,
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: 'OWNER',
        },
      });

      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: 'OWNER',
      };
    });
  }

  async listUserOrganizations(userId: string): Promise<OrganizationSummary[]> {
    const memberships = await prisma.membership.findMany({
      where: { userId },
      include: {
        organization: true,
      },
      orderBy: { organization: { name: 'asc' } },
    });

    return memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
    }));
  }

  async getOrganizationByIdWithRole(organizationId: string, userId: string): Promise<{ id: string; name: string; slug: string; role: OrganizationRole; createdAt: Date; updatedAt: Date } | null> {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!membership) {
      return null;
    }

    return {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
      createdAt: membership.organization.createdAt,
      updatedAt: membership.organization.updatedAt,
    };
  }

  async updateOrganization(organizationId: string, name?: string): Promise<{ id: string; name: string; slug: string; updatedAt: Date }> {
    const existing = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, slug: true },
    });

    if (!existing) {
      throw new HttpAuthError('ORGANIZATION_NOT_FOUND', 'Organization not found.', 404);
    }

    const nextName = name ?? existing.name;
    const slug = name ? await this.generateUniqueSlug(nextName, organizationId) : existing.slug;

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: nextName,
        slug,
      },
    });

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      updatedAt: organization.updatedAt,
    };
  }

  async listMembers(organizationId: string): Promise<Array<{ userId: string; name: string; email: string; role: OrganizationRole }>> {
    const memberships = await prisma.membership.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
    });

    return memberships.map((membership) => ({
      userId: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
    }));
  }

  async addMember(organizationId: string, email: string, role: Exclude<OrganizationRole, 'OWNER'>, actorRole?: OrganizationRole): Promise<{ userId: string; role: OrganizationRole }> {
    if (actorRole === 'ADMIN' && role === 'ADMIN') {
      throw new HttpAuthError('FORBIDDEN', 'Admin users may only add MEMBER or VIEWER roles.', 403);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      throw new HttpAuthError('USER_NOT_FOUND', 'User not found.', 404);
    }

    const existing = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId,
        },
      },
    });

    if (existing) {
      throw new HttpAuthError('MEMBERSHIP_ALREADY_EXISTS', 'User is already a member of this organization.', 409);
    }

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        role,
      },
    });

    return {
      userId: membership.userId,
      role: membership.role,
    };
  }

  async getMembership(organizationId: string, userId: string): Promise<OrganizationMembership | null> {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });

    return membership ? { ...membership, organizationId: membership.organizationId, userId: membership.userId } : null;
  }

  async changeMemberRole(organizationId: string, targetUserId: string, nextRole: Exclude<OrganizationRole, 'OWNER'>, actorRole?: OrganizationRole): Promise<{ userId: string; role: OrganizationRole }> {
    const ownerCount = await prisma.membership.count({
      where: {
        organizationId,
        role: 'OWNER',
      },
    });

    const targetMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId,
        },
      },
    });

    if (!targetMembership) {
      throw new HttpAuthError('MEMBERSHIP_NOT_FOUND', 'Membership not found.', 404);
    }

    if (actorRole === 'ADMIN') {
      if (targetMembership.role === 'OWNER' || targetMembership.role === 'ADMIN') {
        throw new HttpAuthError('FORBIDDEN', 'Admin users may only modify MEMBER and VIEWER roles.', 403);
      }

      if (nextRole === 'ADMIN') {
        throw new HttpAuthError('FORBIDDEN', 'Admin users may not assign the ADMIN role.', 403);
      }
    }

    if (targetMembership.role === 'OWNER') {
      if (ownerCount === 1) {
        throw new HttpAuthError('LAST_OWNER_PROTECTION', 'The organization must have at least one owner.', 409);
      }
      throw new HttpAuthError('FORBIDDEN', 'An owner cannot be demoted via this route.', 403);
    }

    const updated = await prisma.membership.update({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId,
        },
      },
      data: {
        role: nextRole,
      },
    });

    return {
      userId: updated.userId,
      role: updated.role,
    };
  }

  async removeMember(organizationId: string, targetUserId: string, actorRole?: OrganizationRole): Promise<void> {
    const targetMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId,
        },
      },
    });

    if (!targetMembership) {
      throw new HttpAuthError('MEMBERSHIP_NOT_FOUND', 'Membership not found.', 404);
    }

    if (actorRole === 'ADMIN' && (targetMembership.role === 'OWNER' || targetMembership.role === 'ADMIN')) {
      throw new HttpAuthError('FORBIDDEN', 'Admin users may only remove MEMBER and VIEWER roles.', 403);
    }

    if (targetMembership.role === 'OWNER') {
      const ownerCount = await prisma.membership.count({
        where: {
          organizationId,
          role: 'OWNER',
        },
      });

      if (ownerCount <= 1) {
        throw new HttpAuthError('LAST_OWNER_PROTECTION', 'The organization must have at least one owner.', 409);
      }
    }

    await prisma.membership.delete({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId,
        },
      },
    });
  }

  async requireMembership(organizationId: string, userId: string): Promise<OrganizationMembership> {
    const membership = await this.getMembership(organizationId, userId);

    if (!membership) {
      throw new HttpAuthError('NOT_A_MEMBER', 'You are not a member of this organization.', 403);
    }

    return membership;
  }

  async hasRole(organizationId: string, userId: string, allowedRoles: OrganizationRole[]): Promise<boolean> {
    const membership = await this.getMembership(organizationId, userId);
    return membership ? allowedRoles.includes(membership.role) : false;
  }

  private async generateUniqueSlug(name: string, organizationId?: string): Promise<string> {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'organization';

    let candidate = base;
    let counter = 2;

    while (true) {
      const existing = await prisma.organization.findFirst({
        where: {
          slug: candidate,
          ...(organizationId ? { NOT: { id: organizationId } } : {}),
        },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }

      candidate = `${base}-${counter}`;
      counter += 1;
    }
  }
}

export const organizationService = new OrganizationService();
