import assert from 'node:assert/strict';
import test from 'node:test';

import { prisma } from '../../database/prisma.js';
import { HttpAuthError } from '../auth/auth.service.js';
import { documentService } from './document.service.js';

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

test('document CRUD and filtering respect the knowledge base ownership', async () => {
  const userId = unique('doc-user');
  const orgName = unique('doc-org');

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: `${userId}@example.com`,
      name: 'Doc User',
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
    data: { userId, organizationId: organization.id, role: 'OWNER' },
  });

  const knowledgeBase = await prisma.knowledgeBase.create({
    data: {
      organizationId: organization.id,
      name: unique('doc-kb'),
      description: 'Documents',
    },
  });

  const created = await documentService.createDocument(userId, knowledgeBase.id, {
    name: 'Authentication Architecture',
    originalFileName: 'authentication.pdf',
    mimeType: 'application/pdf',
    fileSize: 245760,
    status: 'UPLOADED',
  });

  assert.equal(created.name, 'Authentication Architecture');
  assert.equal(created.status, 'UPLOADED');

  const list = await documentService.listDocuments({
    userId,
    knowledgeBaseId: knowledgeBase.id,
    status: 'UPLOADED',
    search: 'authentication',
    page: 1,
    limit: 20,
  });

  assert.equal(list.data.length, 1);
  assert.equal(list.pagination.total, 1);

  const fetched = await documentService.getDocumentForUser(created.id, userId);
  assert.equal(fetched?.name, 'Authentication Architecture');

  const updated = await documentService.updateDocument(created.id, userId, {
    name: 'Updated Architecture',
    status: 'READY',
  });
  assert.equal(updated.name, 'Updated Architecture');

  const deleted = await documentService.deleteDocument(created.id, userId);
  assert.equal(deleted.id, created.id);

  const afterDelete = await prisma.document.findUnique({ where: { id: created.id } });
  assert.equal(afterDelete, null);
});

test('document access rejects cross-tenant access', async () => {
  const userA = unique('doc-user-a');
  const userB = unique('doc-user-b');
  const orgA = await prisma.organization.create({ data: { name: unique('doc-org-a'), slug: `doc-org-a-${Date.now()}` } });
  const orgB = await prisma.organization.create({ data: { name: unique('doc-org-b'), slug: `doc-org-b-${Date.now()}` } });

  await prisma.user.createMany({
    data: [
      { id: userA, email: `${userA}@example.com`, name: 'Doc User A', passwordHash: 'hash' },
      { id: userB, email: `${userB}@example.com`, name: 'Doc User B', passwordHash: 'hash' },
    ],
  });

  await prisma.membership.createMany({
    data: [
      { userId: userA, organizationId: orgA.id, role: 'OWNER' },
      { userId: userB, organizationId: orgB.id, role: 'OWNER' },
    ],
  });

  const kbB = await prisma.knowledgeBase.create({
    data: {
      organizationId: orgB.id,
      name: unique('doc-kb-b'),
      description: 'Org B KB',
    },
  });

  const docB = await prisma.document.create({
    data: {
      knowledgeBaseId: kbB.id,
      name: 'OrgB doc',
      originalFileName: 'orgb.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      status: 'UPLOADED',
    },
  });

  await assert.rejects(
    () => documentService.getDocumentForUser(docB.id, userA),
    (error) => error instanceof HttpAuthError && error.statusCode === 403,
  );
});
