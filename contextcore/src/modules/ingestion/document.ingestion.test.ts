import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';

import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { CHUNKING_VERSION, MAX_CHUNK_SIZE, chunkText, extractTextFromFile, IngestionService, ingestionService } from './ingestion.service.js';
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

test('uploadDocument validates the tenant and supported file type before ingestion', async (t) => {
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
  t.after(async () => {
    await prisma.organization.deleteMany({ where: { id: organization.id } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  let embeddingCalls = 0;
  const service = new IngestionService({
    embedDocument: async (documentId, requestingUserId) => {
      embeddingCalls += 1;
      assert.equal(requestingUserId, userId);
      return { documentId, provider: 'local', model: 'BAAI/bge-small-en-v1.5', status: 'READY', totalChunks: 1, embeddedChunks: 1, skippedChunks: 0, failedChunks: 0 };
    },
  });

  const result = await service.uploadDocument(userId, knowledgeBase.id, {
    originalFileName: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Uploaded through the ingestion service.'),
  });

  assert.equal(result.status, 'READY');
  assert.equal(embeddingCalls, 1);
  const storedDocument = await prisma.document.findUniqueOrThrow({ where: { id: result.id } });
  assert.match(storedDocument.storagePath ?? '', new RegExp(`${result.id}\\.txt$`));
  assert.equal(storedDocument.mimeType, 'text/plain');
  assert.equal(storedDocument.originalFileName, 'notes.txt');

  await assert.rejects(
    () => service.uploadDocument(userId, knowledgeBase.id, {
      originalFileName: 'notes.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('not supported'),
    }),
    /Unsupported file type/,
  );
  await assert.rejects(
    () => service.uploadDocument(userId, knowledgeBase.id, {
      originalFileName: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0),
    }),
    /cannot be empty/,
  );
  await assert.rejects(
    () => service.uploadDocument(userId, knowledgeBase.id, {
      originalFileName: 'notes.pdf', mimeType: 'text/plain', buffer: Buffer.from('%PDF-1.7'),
    }),
    /does not match its extension/,
  );

  const otherUserId = unique('foreign-upload-user');
  await assert.rejects(
    () => service.uploadDocument(otherUserId, knowledgeBase.id, {
      originalFileName: 'other.txt', mimeType: 'text/plain', buffer: Buffer.from('must not be accepted'),
    }),
    (error: unknown) => error instanceof Error && 'statusCode' in error && error.statusCode === 403,
  );

  await assert.rejects(
    () => service.uploadDocument(userId, knowledgeBase.id, {
      originalFileName: 'large.txt', mimeType: 'text/plain', buffer: Buffer.alloc(env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 + 1),
    }),
    /too large/,
  );

  const failed = await service.uploadDocument(userId, knowledgeBase.id, {
    originalFileName: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 malformed'),
  });
  assert.equal(failed.status, 'FAILED');
  const failedDocument = await prisma.document.findUniqueOrThrow({ where: { id: failed.id } });
  assert.equal(failedDocument.status, 'FAILED');
  assert.ok(failedDocument.processingError);

  const embeddingFailureService = new IngestionService({
    embedDocument: async (documentId) => ({
      documentId, provider: 'local', model: 'BAAI/bge-small-en-v1.5', status: 'FAILED', totalChunks: 1, embeddedChunks: 0, skippedChunks: 0, failedChunks: 1,
    }),
  });
  const embeddingFailed = await embeddingFailureService.uploadDocument(userId, knowledgeBase.id, {
    originalFileName: 'embedding-fail.txt', mimeType: 'text/plain', buffer: Buffer.from('Text extracted successfully but embeddings will fail.'),
  });
  assert.equal(embeddingFailed.status, 'FAILED');
  assert.equal((await prisma.document.findUniqueOrThrow({ where: { id: embeddingFailed.id } })).status, 'FAILED');
});

test('extracts text from PDF, DOCX, and UTF-8 TXT without trusting their MIME types', async () => {
  const pdfText = await extractTextFromFile('pdf', makePdf('Extracted PDF test text'));
  assert.match(pdfText, /Extracted PDF test text/);

  const docxText = await extractTextFromFile('docx', makeDocx('<w:p><w:r><w:t>Extracted DOCX test text</w:t></w:r></w:p>'));
  assert.match(docxText, /Extracted DOCX test text/);

  assert.equal(await extractTextFromFile('txt', Buffer.from('UTF-8 text ✓')), 'UTF-8 text ✓');
  await assert.rejects(() => extractTextFromFile('txt', Buffer.from([0xff, 0xfe])), /valid UTF-8/);
  await assert.rejects(() => extractTextFromFile('docx', Buffer.from('PK broken')), /DOCX/);
});

function makePdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

function makeDocx(documentXml: string): Buffer {
  const files: Array<[string, string]> = [
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${documentXml}<w:sectPr/></w:body></w:document>`],
  ];
  const crc32 = (data: Buffer): number => {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let localOffset = 0;
  for (const [name, value] of files) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(value);
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, compressed);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(raw.length, 24);
    directory.writeUInt16LE(nameBytes.length, 28);
    directory.writeUInt32LE(localOffset, 42);
    central.push(directory, nameBytes);
    localOffset += header.length + nameBytes.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...local, centralDirectory, end]);
}
