import type { Organization } from '../api/types';

export type FrontendPermission = 'knowledge_base:read' | 'knowledge_base:create' | 'knowledge_base:update' | 'knowledge_base:delete' | 'document:read' | 'document:upload' | 'document:update' | 'document:delete' | 'member:read' | 'member:manage' | 'admin:request' | 'admin:approve' | 'organization:manage' | 'audit:view';
const map: Record<Organization['role'], FrontendPermission[]> = {
  OWNER: ['knowledge_base:read', 'knowledge_base:create', 'knowledge_base:update', 'knowledge_base:delete', 'document:read', 'document:upload', 'document:update', 'document:delete', 'member:read', 'member:manage', 'admin:request', 'admin:approve', 'organization:manage', 'audit:view'],
  ADMIN: ['knowledge_base:read', 'knowledge_base:create', 'knowledge_base:update', 'knowledge_base:delete', 'document:read', 'document:upload', 'document:update', 'document:delete', 'member:read', 'member:manage', 'admin:request'],
  MEMBER: ['knowledge_base:read', 'knowledge_base:create', 'knowledge_base:update', 'document:read', 'document:upload', 'document:update', 'document:delete', 'admin:request'],
  VIEWER: ['knowledge_base:read', 'document:read', 'admin:request'],
};
export function can(role: Organization['role'] | undefined, permission: FrontendPermission): boolean { return Boolean(role && map[role].includes(permission)); }
