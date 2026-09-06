import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';

import { prisma } from '../../database/prisma.js';
import { localStorageProvider } from '../../infrastructure/storage/local-storage.provider.js';
import { knowledgeBaseService } from '../knowledgebase/knowledgebase.service.js';
import { HttpAuthError } from '../auth/auth.service.js';

export const MAX_CHUNK_SIZE = 1800;
export const CHUNK_OVERLAP = 0;
export const CHUNKING_VERSION = 'v1';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/html',
  'application/pdf',
]);

export type IngestionStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';

export type IngestionResult = {
  id: string;
  status: IngestionStatus;
  contentHash: string;
  processingError?: string;
};

export type UploadedDocument = {
  originalFileName: string;
  mimeType: string;
  buffer: Buffer;
};

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n +/g, '\n')
    .trim();
}

export type ChunkDraft = {
  content: string;
  characterStart: number;
  characterEnd: number;
  estimatedTokenCount: number;
  chunkingVersion: string;
};

function estimateTokenCount(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function toChunkDraft(normalized: string, start: number, end: number): ChunkDraft | null {
  const rawContent = normalized.slice(start, end);
  const content = rawContent.trim();
  if (!content) {
    return null;
  }

  const leadingWhitespace = rawContent.length - rawContent.trimStart().length;
  const trailingWhitespace = rawContent.length - rawContent.trimEnd().length;
  const characterStart = start + leadingWhitespace;
  const characterEnd = end - trailingWhitespace;

  return {
    content,
    characterStart,
    characterEnd,
    estimatedTokenCount: estimateTokenCount(content),
    chunkingVersion: CHUNKING_VERSION,
  };
}

function splitOversizedParagraph(normalized: string, start: number, end: number): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  let cursor = start;

  while (cursor < end) {
    while (cursor < end && /\s/.test(normalized[cursor] ?? '')) {
      cursor += 1;
    }

    if (cursor >= end) {
      break;
    }

    const maximumEnd = Math.min(cursor + MAX_CHUNK_SIZE, end);
    let splitEnd = maximumEnd;

    if (maximumEnd < end) {
      const candidate = normalized.slice(cursor, maximumEnd);
      const lastWhitespace = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\n'), candidate.lastIndexOf('\t'));
      if (lastWhitespace > 0) {
        splitEnd = cursor + lastWhitespace;
      }
    }

    const chunk = toChunkDraft(normalized, cursor, splitEnd);
    if (chunk) {
      chunks.push(chunk);
    }

    cursor = splitEnd;
  }

  return chunks;
}

export function chunkText(content: string): ChunkDraft[] {
  const normalized = normalizeText(content);
  if (!normalized) {
    return [];
  }

  const paragraphs: Array<{ start: number; end: number }> = [];
  let searchStart = 0;
  for (const part of normalized.split(/\n\s*\n/)) {
    const trimmed = part.trim();
    if (!trimmed) {
      searchStart += part.length + 2;
      continue;
    }

    const start = normalized.indexOf(trimmed, searchStart);
    const end = start + trimmed.length;
    paragraphs.push({ start, end });
    searchStart = end;
  }

  const chunks: ChunkDraft[] = [];
  let current: { start: number; end: number } | null = null;

  for (const paragraph of paragraphs) {
    if (paragraph.end - paragraph.start > MAX_CHUNK_SIZE) {
      if (current) {
        const chunk = toChunkDraft(normalized, current.start, current.end);
        if (chunk) chunks.push(chunk);
        current = null;
      }
      chunks.push(...splitOversizedParagraph(normalized, paragraph.start, paragraph.end));
      continue;
    }

    if (!current) {
      current = paragraph;
      continue;
    }

    if (paragraph.end - current.start <= MAX_CHUNK_SIZE) {
      current = { start: current.start, end: paragraph.end };
      continue;
    }

    const chunk = toChunkDraft(normalized, current.start, current.end);
    if (chunk) chunks.push(chunk);
    current = paragraph;
  }

  if (current) {
    const chunk = toChunkDraft(normalized, current.start, current.end);
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

function explainFileReadFailure(fileName: string): string {
  const safeName = fileName.replace(/[\\/]+/g, '/').split('/').pop() ?? 'uploaded file';
  return `Unable to extract readable content from "${safeName}". Ensure the file is a supported text-based document and try again.`;
}

async function extractTextFromFile(fileName: string, buffer: Buffer): Promise<string> {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (extension === 'txt' || extension === 'md' || extension === 'csv') {
    return buffer.toString('utf8');
  }

  if (extension === 'json') {
    const parsed = JSON.parse(buffer.toString('utf8'));
    if (typeof parsed === 'string') {
      return parsed;
    }
    return JSON.stringify(parsed, null, 2);
  }

  if (extension === 'html' || extension === 'htm') {
    return buffer.toString('utf8').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  }

  if (extension === 'pdf') {
    const raw = buffer.toString('utf8');
    if (!raw.includes('%PDF-')) {
      throw new Error(explainFileReadFailure(fileName));
    }

    const hasPdfStructure = /\/Type\s*\/((?:Page|Catalog|Pages)|[A-Za-z0-9]+)/i.test(raw) && /stream\s*(?:\r?\n|\r)/i.test(raw) && /endstream/i.test(raw);
    if (!hasPdfStructure) {
      throw new Error(explainFileReadFailure(fileName));
    }

    const textParts = raw.match(/[A-Za-z0-9.,;:!?()\-\s]{20,}/g) ?? [];
    return textParts.join(' ');
  }

  throw new Error(explainFileReadFailure(fileName));
}

export class IngestionService {
  async uploadDocument(userId: string, knowledgeBaseId: string, upload: UploadedDocument): Promise<IngestionResult> {
    const membership = await knowledgeBaseService.getMembershipForKnowledgeBase(knowledgeBaseId, userId);
    if (!membership || membership.role === 'VIEWER') {
      throw new HttpAuthError('FORBIDDEN', 'You do not have permission to upload documents.', 403);
    }

    if (upload.buffer.length === 0) {
      throw new Error('Uploaded file cannot be empty.');
    }

    if (upload.buffer.length > MAX_UPLOAD_BYTES) {
      throw new Error('Uploaded file is too large. Maximum size is 50 MB.');
    }

    if (!SUPPORTED_MIME_TYPES.has(upload.mimeType.toLowerCase())) {
      throw new Error('Unsupported file type. Supported types are TXT, Markdown, CSV, JSON, HTML, and PDF.');
    }

    const documentId = randomUUID();
    const storagePath = await localStorageProvider.save(knowledgeBaseId, `${documentId}-${upload.originalFileName}`, upload.buffer);
    const document = await prisma.document.create({
      data: {
        id: documentId,
        knowledgeBaseId,
        name: upload.originalFileName,
        originalFileName: upload.originalFileName,
        mimeType: upload.mimeType,
        fileSize: upload.buffer.length,
        storagePath,
        status: 'UPLOADED',
      },
    });

    return this.ingestDocument(document.id);
  }

  async ingestDocument(documentId: string): Promise<IngestionResult> {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new Error('Document not found.');
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'PROCESSING' },
    });

    try {
      const fileBuffer = await localStorageProvider.read(document.storagePath ?? '');
      const extractedText = await extractTextFromFile(document.originalFileName, fileBuffer);
      const contentHash = createHash('sha256').update(fileBuffer).digest('hex');

      const chunks = chunkText(extractedText);
      if (chunks.length === 0) {
        throw new Error('No readable text could be extracted from the uploaded file.');
      }

      await prisma.$transaction(async (tx) => {
        await tx.documentChunk.deleteMany({ where: { documentId } });

        if (chunks.length > 0) {
          await tx.documentChunk.createMany({
            data: chunks.map((chunk, index) => ({
              documentId,
              chunkIndex: index,
              content: chunk.content,
              contentHash: createHash('sha256').update(chunk.content).digest('hex'),
              characterStart: chunk.characterStart,
              characterEnd: chunk.characterEnd,
              estimatedTokenCount: chunk.estimatedTokenCount,
              chunkingVersion: chunk.chunkingVersion,
            })),
          });
        }

        await tx.document.update({
          where: { id: documentId },
          data: {
            status: 'READY',
            contentHash,
            processingError: null,
          },
        });
      });

      return {
        id: documentId,
        status: 'READY',
        contentHash,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown ingestion failure.';
      const safeMessage = message.replace(/\\/g, '/').replace(/(C:|localhost|127\.0\.0\.1)/gi, '');

      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'FAILED',
          processingError: safeMessage,
        },
      });

      return {
        id: documentId,
        status: 'FAILED',
        contentHash: '',
        processingError: safeMessage,
      };
    }
  }
}

export const ingestionService = new IngestionService();
