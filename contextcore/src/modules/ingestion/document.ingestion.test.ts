import assert from 'node:assert/strict';
import test from 'node:test';

import { prisma } from '../../database/prisma.js';
import { CHUNKING_VERSION, MAX_CHUNK_SIZE, chunkText, ingestionService } from './ingestion.service.js';
import { localStorageProvider } from '../../infrastructure/storage/local-storage.provider.js';

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

test('ingestion stores text chunks and marks the document ready', async () => {
  const userId = unique('ingest-user');
  const orgName = unique('ingest-org');
  const kbName = unique('ingest-kb');

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: `${userId}@example.com`,
      name: 'Ingest User',
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
      name: kbName,
      description: 'Ingestion test',
    },
  });

  const fileText = 'Hello world. This is a test document for ingestion.\n\nIt has multiple paragraphs and should be chunked.';
  const storagePath = await localStorageProvider.save('ingest', `txt-${Date.now()}.txt`, Buffer.from(fileText));

  const document = await prisma.document.create({
    data: {
      knowledgeBaseId: knowledgeBase.id,
      name: 'ingest.txt',
      originalFileName: 'ingest.txt',
      mimeType: 'text/plain',
      fileSize: fileText.length,
      status: 'UPLOADED',
      storagePath,
      contentHash: 'hash-placeholder',
    },
  });

  const result = await ingestionService.ingestDocument(document.id);
  assert.equal(result.status, 'READY');

  const chunks = await prisma.documentChunk.findMany({
    where: { documentId: document.id },
    orderBy: { chunkIndex: 'asc' },
  });

  assert.ok(chunks.length > 0);
  assert.ok(chunks.some((chunk) => chunk.content.includes('Hello world')));
  assert.equal(chunks.every((chunk) => chunk.content.trim().length > 0), true);
  assert.equal(chunks.every((chunk) => chunk.content.length <= MAX_CHUNK_SIZE), true);
  assert.equal(chunks.every((chunk) => chunk.characterStart < chunk.characterEnd), true);
  assert.equal(chunks.every((chunk) => chunk.estimatedTokenCount > 0), true);
  assert.equal(chunks.every((chunk) => chunk.chunkingVersion === CHUNKING_VERSION), true);
  assert.equal(chunks[0]?.characterStart, 0);

  await assert.rejects(
    () => prisma.documentChunk.create({
      data: {
        documentId: document.id,
        chunkIndex: chunks[0]?.chunkIndex ?? 0,
        content: 'duplicate index',
        contentHash: 'duplicate-hash',
        characterStart: 0,
        characterEnd: 15,
        estimatedTokenCount: 4,
        chunkingVersion: CHUNKING_VERSION,
      },
    }),
    /Unique constraint failed/,
  );

  const replacementText = 'Replacement content with regenerated chunk metadata.';
  const replacementPath = await localStorageProvider.save('ingest', `replacement-${Date.now()}.txt`, Buffer.from(replacementText));
  await prisma.document.update({
    where: { id: document.id },
    data: { storagePath: replacementPath, originalFileName: 'replacement.txt' },
  });

  const reingested = await ingestionService.ingestDocument(document.id);
  assert.equal(reingested.status, 'READY');

  const replacementChunks = await prisma.documentChunk.findMany({
    where: { documentId: document.id },
    orderBy: { chunkIndex: 'asc' },
  });

  assert.equal(replacementChunks.length, 1);
  assert.equal(replacementChunks[0]?.content, replacementText);
  assert.equal(replacementChunks[0]?.chunkIndex, 0);
  assert.equal(replacementChunks[0]?.characterStart, 0);
  assert.equal(replacementChunks[0]?.characterEnd, replacementText.length);
  assert.equal(replacementChunks[0]?.chunkingVersion, CHUNKING_VERSION);
});

test('oversized paragraphs split deterministically without empty chunks or unnecessary word splits', () => {
  const oversizedParagraph = Array.from({ length: 500 }, (_, index) => `word-${index}`).join(' ');
  const firstRun = chunkText(oversizedParagraph);
  const secondRun = chunkText(oversizedParagraph);

  assert.deepEqual(firstRun, secondRun);
  assert.ok(firstRun.length > 1);
  assert.equal(firstRun.every((chunk) => chunk.content.length <= MAX_CHUNK_SIZE), true);
  assert.equal(firstRun.every((chunk) => chunk.content.trim().length > 0), true);
  assert.equal(firstRun.map((chunk) => chunk.content).join(' '), oversizedParagraph);
  assert.equal(firstRun.every((chunk) => chunk.characterStart < chunk.characterEnd), true);
  assert.equal(firstRun.every((chunk) => chunk.chunkingVersion === CHUNKING_VERSION), true);
});

test('failed extraction stores a safe processing error and preserves the document status', async () => {
  const userId = unique('fail-user');
  const org = await prisma.organization.create({
    data: { name: unique('fail-org'), slug: `fail-org-${Date.now()}` },
  });

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `${userId}@example.com`, name: 'Fail User', passwordHash: 'hash' },
  });

  await prisma.membership.create({
    data: { userId, organizationId: org.id, role: 'OWNER' },
  });

  const kb = await prisma.knowledgeBase.create({
    data: { organizationId: org.id, name: unique('fail-kb'), description: 'Failure test' },
  });

  const storagePath = await localStorageProvider.save('ingestion-fail', `bad-${Date.now()}.pdf`, Buffer.from('%PDF-1.4\nBROKEN')); 

  const document = await prisma.document.create({
    data: {
      knowledgeBaseId: kb.id,
      name: 'bad.pdf',
      originalFileName: 'bad.pdf',
      mimeType: 'application/pdf',
      fileSize: 16,
      status: 'UPLOADED',
      storagePath,
      contentHash: 'hash-bad',
    },
  });

  const result = await ingestionService.ingestDocument(document.id);

  assert.equal(result.status, 'FAILED');
  assert.ok(result.processingError && result.processingError.length > 0);
  assert.ok(!result.processingError.includes('C:\\') && !result.processingError.includes('localhost'));
});

test('uploadDocument validates the tenant and supported file type before ingestion', async () => {
  const userId = unique('upload-user');
  const organization = await prisma.organization.create({
    data: { name: unique('upload-org'), slug: `upload-org-${Date.now()}` },
  });

  await prisma.user.create({
    data: { id: userId, email: `${userId}@example.com`, name: 'Upload User', passwordHash: 'hash' },
  });

  await prisma.membership.create({
    data: { userId, organizationId: organization.id, role: 'OWNER' },
  });

  const knowledgeBase = await prisma.knowledgeBase.create({
    data: { organizationId: organization.id, name: unique('upload-kb') },
  });

  const result = await ingestionService.uploadDocument(userId, knowledgeBase.id, {
    originalFileName: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Uploaded through the ingestion service.'),
  });

  assert.equal(result.status, 'READY');

  await assert.rejects(
    () => ingestionService.uploadDocument(userId, knowledgeBase.id, {
      originalFileName: 'notes.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('not supported'),
    }),
    /Unsupported file type/,
  );
});
