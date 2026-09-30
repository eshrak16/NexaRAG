import type { OrganizationRole } from './organization.types.js';

export const ORGANIZATION_PERMISSIONS = [
  'knowledge_base:read', 'knowledge_base:create', 'knowledge_base:update', 'knowledge_base:delete',
  'document:read', 'document:upload', 'document:update', 'document:delete',
  'member:read', 'member:manage', 'admin:request', 'admin:approve',
  'organization:manage', 'audit:view',
] as const;

export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];

const permissionMap: Record<OrganizationRole, readonly OrganizationPermission[]> = {
  OWNER: ORGANIZATION_PERMISSIONS,
  ADMIN: [
    'knowledge_base:read', 'knowledge_base:create', 'knowledge_base:update', 'knowledge_base:delete',
    'document:read', 'document:upload', 'document:update', 'document:delete',
    'member:read', 'member:manage', 'admin:request',
  ],
  MEMBER: ['knowledge_base:read', 'knowledge_base:create', 'knowledge_base:update', 'document:read', 'document:upload', 'document:update', 'document:delete', 'admin:request'],
  VIEWER: ['knowledge_base:read', 'document:read', 'admin:request'],
};

export function can(role: OrganizationRole, permission: OrganizationPermission): boolean {
  return permissionMap[role].includes(permission);
}

export function permissionsFor(role: OrganizationRole): readonly OrganizationPermission[] {
  return permissionMap[role];
}
