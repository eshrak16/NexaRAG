import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { localStorageProvider } from '../../infrastructure/storage/local-storage.provider.js';
import { embeddingService } from '../embeddings/embedding.service.js';
import { knowledgeBaseService } from '../knowledgebase/knowledgebase.service.js';
import { HttpAuthError } from '../auth/auth.service.js';

export const MAX_CHUNK_SIZE = 1800;
export const CHUNK_OVERLAP = 0;
export const CHUNKING_VERSION = 'v1';
const MAX_UPLOAD_BYTES = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const MAX_PDF_PAGES = 200;
const MAX_EXTRACTED_CHARACTERS = 5_000_000;
const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 1000;
type SupportedExtension = 'pdf' | 'docx' | 'txt';
const MIME_TYPES: Record<SupportedExtension, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};
const uploadMetadataSchema = z.object({
  originalFileName: z.string().trim().min(1, 'A file name is required.').max(255, 'File name is too long.'),
  mimeType: z.string().trim().min(1, 'A file content type is required.').max(200),
  fileSize: z.number().int().min(1, 'Uploaded file cannot be empty.').max(MAX_UPLOAD_BYTES, `Uploaded file is too large. Maximum size is ${env.MAX_UPLOAD_SIZE_MB} MB.`),
});

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

function safeOriginalFileName(fileName: string): string {
  const baseName = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
  return baseName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
}

function getAllowedExtension(fileName: string): SupportedExtension {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension !== 'pdf' && extension !== 'docx' && extension !== 'txt') {
    throw new Error('Unsupported file type. Supported formats are PDF, DOCX, and TXT.');
  }
  return extension;
}

function validateMimeType(extension: SupportedExtension, providedMimeType: string): void {
  const mimeType = providedMimeType.split(';', 1)[0]?.trim().toLowerCase();
  if (mimeType !== MIME_TYPES[extension] && mimeType !== 'application/octet-stream') {
    throw new Error('The file type does not match its extension.');
  }
}

function validateDocxArchive(buffer: Buffer): void {
  const minimumEocdOffset = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0 || buffer.readUInt16LE(eocdOffset + 4) !== 0 || buffer.readUInt16LE(eocdOffset + 6) !== 0) {
    throw new Error('The DOCX file is malformed or unreadable.');
  }

  const diskEntries = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const directorySize = buffer.readUInt32LE(eocdOffset + 12);
  const directoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (diskEntries !== entryCount || entryCount === 0 || entryCount > MAX_DOCX_ENTRIES
    || entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff
    || directoryOffset + directorySize > eocdOffset) {
    throw new Error('The DOCX file is malformed or exceeds processing limits.');
  }

  let offset = directoryOffset;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocdOffset || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('The DOCX file is malformed or unreadable.');
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    if ((flags & 1) !== 0 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error('Encrypted and ZIP64 DOCX files are not supported.');
    }
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
      throw new Error('The DOCX archive exceeds the processing size limit.');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset > directoryOffset + directorySize) throw new Error('The DOCX file is malformed or unreadable.');
}

export async function extractTextFromFile(extension: string, buffer: Buffer): Promise<string> {
  if (extension === 'txt' || extension === 'md' || extension === 'csv') {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new Error('The TXT file is not valid UTF-8 text.');
    }
    if (text.includes('\u0000')) throw new Error('The TXT file is not valid UTF-8 text.');
    return text;
  }

  if (extension === 'json') {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
  }

  if (extension === 'html' || extension === 'htm') {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
  }

  if (extension === 'docx') {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error('The DOCX file is malformed or unreadable.');
    }
    validateDocxArchive(buffer);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  const signature = buffer.indexOf(Buffer.from('%PDF-'), 0, 'ascii');
  if (signature < 0 || signature > 1024) throw new Error('The PDF file is malformed or unreadable.');
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: false,
    stopAtErrors: true,
    verbosity: 0,
  } as Parameters<typeof getDocument>[0] & { isEvalSupported: boolean });
  const pdf = await loadingTask.promise;

  try {
    if (pdf.numPages < 1 || pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDF page count exceeds the ${MAX_PDF_PAGES}-page processing limit.`);
    }
    const pages: string[] = [];
    let characterCount = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ');
      characterCount += text.length;
      if (characterCount > MAX_EXTRACTED_CHARACTERS) {
        throw new Error('Extracted document text exceeds the processing limit.');
      }
      pages.push(text);
      page.cleanup();
    }
    return pages.join('\n\n');
  } finally {
    await loadingTask.destroy();
  }
}

export type DocumentEmbedder = Pick<typeof embeddingService, 'embedDocument'>;

export class IngestionService {
  constructor(private readonly embedder: DocumentEmbedder = embeddingService) {}

  async uploadDocument(userId: string, knowledgeBaseId: string, upload: UploadedDocument): Promise<IngestionResult> {
    const membership = await knowledgeBaseService.getMembershipForKnowledgeBase(knowledgeBaseId, userId);
    if (!membership || membership.role === 'VIEWER') {
      throw new HttpAuthError('FORBIDDEN', 'You do not have permission to upload documents.', 403);
    }

    const metadata = uploadMetadataSchema.parse({
      originalFileName: safeOriginalFileName(upload.originalFileName),
      mimeType: upload.mimeType,
      fileSize: upload.buffer.length,
    });
    const originalFileName = metadata.originalFileName;
    const extension = getAllowedExtension(originalFileName);
    validateMimeType(extension, metadata.mimeType);
    if (extension === 'pdf' && upload.buffer.indexOf(Buffer.from('%PDF-'), 0, 'ascii') < 0) {
      throw new Error('The uploaded content does not match a PDF file.');
    }
    if (extension === 'docx' && !(upload.buffer[0] === 0x50 && upload.buffer[1] === 0x4b)) {
      throw new Error('The uploaded content does not match a DOCX file.');
    }

    const documentId = randomUUID();
    const storagePath = await localStorageProvider.save(knowledgeBaseId, `${documentId}.${extension}`, upload.buffer);
    const document = await prisma.document.create({
      data: {
        id: documentId,
        knowledgeBaseId,
        name: originalFileName,
        originalFileName,
        mimeType: MIME_TYPES[extension],
        fileSize: upload.buffer.length,
        storagePath,
        status: 'UPLOADED',
      },
    });

    const ingestion = await this.ingestDocument(document.id);
    if (ingestion.status === 'FAILED') return ingestion;

    try {
      const embedding = await this.embedder.embedDocument(document.id, userId);
      if (embedding.status === 'FAILED') {
        const processingError = 'Document embeddings could not be generated.';
        await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED', processingError } });
        return { ...ingestion, status: 'FAILED', processingError };
      }
      return ingestion;
    } catch {
      const processingError = 'Document processing failed. Please verify the file and try again.';
      await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED', processingError } });
      return { ...ingestion, status: 'FAILED', processingError };
    }
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
      const extension = document.originalFileName.split('.').pop()?.toLowerCase() ?? '';
      const extractedText = await extractTextFromFile(extension, fileBuffer);
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
      const safeMessage = error instanceof Error && error.message.startsWith('No readable text')
        ? error.message
        : 'Document processing failed. Please verify the file and try again.';

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
