import assert from 'node:assert/strict';
import test from 'node:test';

import { prisma } from '../../database/prisma.js';
import { AuthUser } from '../auth/auth.types.js';
import { organizationService } from './organization.service.js';

test('organization creation creates owner membership in same transaction', async () => {
  const user: AuthUser = {
    id: 'user-org-create',
    email: 'owner-create@example.com',
    name: 'Owner Create',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const existingUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!existingUser) {
    await prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        passwordHash: 'test-password-hash',
      },
    });
  }

  const result = await organizationService.createOrganization(user, 'Acme Engineering');

  assert.equal(result.role, 'OWNER');
  assert.ok(result.slug.includes('acme'));

  const membership = await prisma.membership.findFirst({
    where: {
      organizationId: result.id,
      userId: user.id,
    },
  });

  assert.ok(membership);
  assert.equal(membership?.role, 'OWNER');
});

test('listUserOrganizations returns only memberships for the user', async () => {
  const userId = 'user-org-list-' + Date.now();
  const otherUserId = 'user-org-other-' + Date.now();

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: `list-user-${Date.now()}@example.com`,
      name: 'List User',
      passwordHash: 'hash',
    },
  });

  await prisma.user.upsert({
    where: { id: otherUserId },
    update: {},
    create: {
      id: otherUserId,
      email: `other-list-user-${Date.now()}@example.com`,
      name: 'Other User',
      passwordHash: 'hash',
    },
  });

  const orgA = await prisma.organization.create({
    data: {
      name: 'Org A ' + Date.now(),
      slug: `org-a-${Date.now()}`,
    },
  });

  const orgB = await prisma.organization.create({
    data: {
      name: 'Org B ' + Date.now(),
      slug: `org-b-${Date.now()}`,
    },
  });

  await prisma.membership.createMany({
    data: [
      { userId, organizationId: orgA.id, role: 'OWNER' },
      { userId: otherUserId, organizationId: orgB.id, role: 'OWNER' },
    ],
  });

  const organizations = await organizationService.listUserOrganizations(userId);
  assert.deepEqual(organizations.map((org) => org.id).sort(), [orgA.id]);
});

test('duplicate membership is rejected', async () => {
  const userId = 'user-duplicate-membership-' + Date.now();
  const org = await prisma.organization.create({
    data: {
      name: 'Duplicate Org ' + Date.now(),
      slug: `duplicate-org-${Date.now()}`,
    },
  });

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: `duplicate-${Date.now()}@example.com`,
      name: 'Duplicate',
      passwordHash: 'hash',
    },
  });

  await prisma.membership.create({
    data: {
      userId,
      organizationId: org.id,
      role: 'MEMBER',
    },
  });

  await assert.rejects(() => organizationService.addMember(org.id, `duplicate-${Date.now()}@example.com`, 'MEMBER'), /not found/i);
});

test('last owner protection blocks destructive owner changes', async () => {
  const userId = 'user-last-owner-' + Date.now();
  const org = await prisma.organization.create({
    data: {
      name: 'Last Owner Org ' + Date.now(),
      slug: `last-owner-${Date.now()}`,
    },
  });

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: `last-owner-${Date.now()}@example.com`,
      name: 'Last Owner',
      passwordHash: 'hash',
    },
  });

  await prisma.membership.create({
    data: {
      userId,
      organizationId: org.id,
      role: 'OWNER',
    },
  });

  await assert.rejects(() => organizationService.removeMember(org.id, userId), /must have at least one owner/i);
});
