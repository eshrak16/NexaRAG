import assert from 'node:assert/strict';
import test from 'node:test';

import { prisma } from '../../database/prisma.js';
import { HttpAuthError } from '../auth/auth.service.js';
import { knowledgeBaseService } from './knowledgebase.service.js';

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

test('knowledge base create, list, get, update, and delete work within a tenant', async () => {
  const userId = unique('kb-user');
  const orgName = unique('kb-org');
  const kbName = unique('kb-name');

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: `${userId}@example.com`,
      name: 'KB User',
      passwordHash: 'hash',
    },
  });

  const organization = await prisma.organization.create({
    data: {
      name: orgName,
      slug: `${orgName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
    },
  });

  await prisma.membership.create({
    data: {
      userId,
      organizationId: organization.id,
      role: 'OWNER',
    },
  });

  const created = await knowledgeBaseService.createKnowledgeBase(userId, {
    organizationId: organization.id,
    name: kbName,
    description: 'Internal documentation',
  });

  assert.equal(created.organizationId, organization.id);
  assert.equal(created.name, kbName);

  const list = await knowledgeBaseService.listKnowledgeBases({
    userId,
    organizationId: organization.id,
    page: 1,
    limit: 20,
  });

  assert.equal(list.data.length, 1);
  assert.equal(list.pagination.total, 1);
  assert.equal(list.data[0]?.id, created.id);

  const fetched = await knowledgeBaseService.getKnowledgeBaseForUser(created.id, userId);
  assert.equal(fetched?.name, kbName);

  const updated = await knowledgeBaseService.updateKnowledgeBase(created.id, userId, {
    name: 'Updated KB Name',
    description: 'Updated description',
  });

  assert.equal(updated.name, 'Updated KB Name');

  const deleted = await knowledgeBaseService.deleteKnowledgeBase(created.id, userId);
  assert.equal(deleted.id, created.id);

  const afterDelete = await prisma.knowledgeBase.findUnique({ where: { id: created.id } });
  assert.equal(afterDelete, null);
});

test('knowledge base listing and access enforce tenant membership', async () => {
  const userA = unique('tenant-user-a');
  const userB = unique('tenant-user-b');
  const orgA = await prisma.organization.create({
    data: { name: unique('tenant-a'), slug: `tenant-a-${Date.now()}` },
  });
  const orgB = await prisma.organization.create({
    data: { name: unique('tenant-b'), slug: `tenant-b-${Date.now()}` },
  });

  await prisma.user.createMany({
    data: [
      { id: userA, email: `${userA}@example.com`, name: 'User A', passwordHash: 'hash' },
      { id: userB, email: `${userB}@example.com`, name: 'User B', passwordHash: 'hash' },
    ],
  });

  await prisma.membership.createMany({
    data: [
      { userId: userA, organizationId: orgA.id, role: 'OWNER' },
      { userId: userB, organizationId: orgB.id, role: 'OWNER' },
    ],
  });

  const kbA = await knowledgeBaseService.createKnowledgeBase(userA, {
    organizationId: orgA.id,
    name: 'Secret A',
    description: 'Org A KB',
  });

  const kbB = await knowledgeBaseService.createKnowledgeBase(userB, {
    organizationId: orgB.id,
    name: 'Secret B',
    description: 'Org B KB',
  });

  const listA = await knowledgeBaseService.listKnowledgeBases({ userId: userA, page: 1, limit: 20 });
  assert.ok(listA.data.some((item) => item.id === kbA.id));
  assert.ok(!listA.data.some((item) => item.id === kbB.id));

  await assert.rejects(
    () => knowledgeBaseService.getKnowledgeBaseForUser(kbB.id, userA),
    (error) => error instanceof HttpAuthError && error.statusCode === 403,
  );
});
