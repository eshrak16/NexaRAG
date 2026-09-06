import type { AuthUser } from '../auth/auth.types.js';

export const ORGANIZATION_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
};

export type OrganizationDetail = OrganizationSummary & {
  createdAt: Date;
  updatedAt: Date;
};

export type OrganizationMembership = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    organization?: {
      id: string;
      role: OrganizationRole;
    };
    membership?: OrganizationMembership;
  }
}
