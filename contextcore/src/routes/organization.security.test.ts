import assert from 'node:assert/strict';
import test from 'node:test';
import argon2 from 'argon2';
import { buildApp } from '../app.js';
import { prisma } from '../database/prisma.js';
import { authService } from '../modules/auth/auth.service.js';
import { organizationService } from '../modules/organizations/organization.service.js';

test('organization routes enforce membership, role limits, and prevent direct Admin grants', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'route-test-password';
  const passwordHash = await argon2.hash(password);
  const owner = await prisma.user.create({ data: { email: `route-owner-${suffix}@example.test`, name: 'Route Owner', passwordHash } });
  const admin = await prisma.user.create({ data: { email: `route-admin-${suffix}@example.test`, name: 'Route Admin', passwordHash } });
  const member = await prisma.user.create({ data: { email: `route-member-${suffix}@example.test`, name: 'Route Member', passwordHash } });
  const viewer = await prisma.user.create({ data: { email: `route-viewer-${suffix}@example.test`, name: 'Route Viewer', passwordHash } });
  const outsider = await prisma.user.create({ data: { email: `route-outsider-${suffix}@example.test`, name: 'Route Outsider', passwordHash } });
  const organization = await organizationService.createOrganization({ ...owner }, `Route Security ${suffix}`);
  await prisma.membership.create({ data: { userId: admin.id, organizationId: organization.id, role: 'ADMIN' } });
  await prisma.membership.createMany({ data: [{ userId: member.id, organizationId: organization.id, role: 'MEMBER' }, { userId: viewer.id, organizationId: organization.id, role: 'VIEWER' }] });
  const app = await buildApp();
  try {
    const ownerTokens = await authService.login(owner.email, password);
    const adminTokens = await authService.login(admin.email, password);
    const memberTokens = await authService.login(member.email, password);
    const viewerTokens = await authService.login(viewer.email, password);
    const outsiderTokens = await authService.login(outsider.email, password);
    const membersUrl = `/api/v1/organizations/${organization.id}/members`;
    assert.equal((await app.inject({ method: 'GET', url: membersUrl, headers: { authorization: `Bearer ${ownerTokens.accessToken}` } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: membersUrl, headers: { authorization: `Bearer ${adminTokens.accessToken}` } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: membersUrl, headers: { authorization: `Bearer ${memberTokens.accessToken}` } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: membersUrl, headers: { authorization: `Bearer ${viewerTokens.accessToken}` } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: membersUrl, headers: { authorization: `Bearer ${outsiderTokens.accessToken}` } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: membersUrl, headers: { authorization: `Bearer ${viewerTokens.accessToken}` }, payload: { email: outsider.email, role: 'MEMBER' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'PATCH', url: `/api/v1/organizations/${organization.id}`, headers: { authorization: `Bearer ${adminTokens.accessToken}` }, payload: { name: 'Forbidden rename' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: membersUrl, headers: { authorization: `Bearer ${ownerTokens.accessToken}` }, payload: { email: outsider.email, role: 'ADMIN' } })).statusCode, 400);
  } finally {
    await app.close();
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, admin.id, member.id, viewer.id, outsider.id] } } });
  }
});
