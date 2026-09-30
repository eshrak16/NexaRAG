import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../database/prisma.js';
import { HttpAuthError } from '../auth/auth.service.js';
import { organizationService } from './organization.service.js';
import { adminService } from './admin.service.js';

test('Admin requests require owner review, are unique while pending, and record decisions', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const users = await Promise.all(['owner', 'member', 'outsider', 'admin'].map((role) => prisma.user.create({ data: { email: `admin-flow-${role}-${suffix}@example.test`, name: role, passwordHash: 'test-hash' } })));
  const [owner, member, outsider, admin] = users;
  if (!owner || !member || !outsider || !admin) throw new Error('Test user setup failed.');
  const organization = await organizationService.createOrganization({ ...owner }, `Admin Flow ${suffix}`);
  await prisma.membership.createMany({ data: [
    { userId: member.id, organizationId: organization.id, role: 'MEMBER' },
    { userId: admin.id, organizationId: organization.id, role: 'ADMIN' },
  ] });
  const otherOrganization = await organizationService.createOrganization({ ...outsider }, `Other Admin Flow ${suffix}`);
  try {
    const request = await adminService.requestAdmin(organization.id, member.id);
    assert.equal(request.status, 'PENDING');
    await assert.rejects(() => adminService.requestAdmin(organization.id, member.id), (error: unknown) => error instanceof HttpAuthError && error.code === 'REQUEST_ALREADY_PENDING');
    await assert.rejects(() => adminService.listRequests(organization.id, admin.id), (error: unknown) => error instanceof HttpAuthError && error.statusCode === 403);
    await assert.rejects(() => adminService.reviewRequest(organization.id, request.id, admin.id, true), (error: unknown) => error instanceof HttpAuthError && error.statusCode === 403);
    await assert.rejects(() => adminService.reviewRequest(otherOrganization.id, request.id, outsider.id, true), (error: unknown) => error instanceof HttpAuthError && error.statusCode === 404);

    const approved = await adminService.reviewRequest(organization.id, request.id, owner.id, true);
    assert.equal(approved.status, 'APPROVED');
    assert.equal((await organizationService.getMembership(organization.id, member.id))?.role, 'ADMIN');
    const approvalEvents = await adminService.listAuditEvents(organization.id, owner.id);
    assert.ok(approvalEvents.some((event) => event.action === 'ADMIN_REQUEST_APPROVED' && event.targetUserId === member.id));
    await assert.rejects(() => adminService.reviewRequest(organization.id, request.id, owner.id, false), (error: unknown) => error instanceof HttpAuthError && error.code === 'REQUEST_NOT_PENDING');

    await prisma.membership.update({ where: { userId_organizationId: { userId: member.id, organizationId: organization.id } }, data: { role: 'MEMBER' } });
    const rejectedRequest = await adminService.requestAdmin(organization.id, member.id);
    const rejected = await adminService.reviewRequest(organization.id, rejectedRequest.id, owner.id, false);
    assert.equal(rejected.status, 'REJECTED');
    assert.equal((await organizationService.getMembership(organization.id, member.id))?.role, 'MEMBER');
    assert.ok((await adminService.listAuditEvents(organization.id, owner.id)).some((event) => event.action === 'ADMIN_REQUEST_REJECTED' && event.targetUserId === member.id));
  } finally {
    await prisma.organization.deleteMany({ where: { id: { in: [organization.id, otherOrganization.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  }
});

test('Admin request author cannot self-approve and owner-only decisions are enforced', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const owner = await prisma.user.create({ data: { email: `self-owner-${suffix}@example.test`, name: 'Owner', passwordHash: 'test-hash' } });
  const member = await prisma.user.create({ data: { email: `self-member-${suffix}@example.test`, name: 'Member', passwordHash: 'test-hash' } });
  const organization = await organizationService.createOrganization({ ...owner }, `Self Approval ${suffix}`);
  await prisma.membership.create({ data: { userId: member.id, organizationId: organization.id, role: 'MEMBER' } });
  try {
    const request = await adminService.requestAdmin(organization.id, member.id);
    await assert.rejects(() => adminService.reviewRequest(organization.id, request.id, member.id, true), (error: unknown) => error instanceof HttpAuthError && error.code === 'FORBIDDEN');
    assert.equal((await organizationService.getMembership(organization.id, member.id))?.role, 'MEMBER');
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, member.id] } } });
  }
});
