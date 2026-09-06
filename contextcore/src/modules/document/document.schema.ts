import { z } from 'zod';

export const documentStatusSchema = z.enum(['UPLOADED', 'PROCESSING', 'READY', 'FAILED']);

export const documentIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Document id is required.'),
});

export const knowledgeBaseDocumentIdParamSchema = z.object({
  knowledgeBaseId: z.string().trim().min(1, 'Knowledge base id is required.'),
});

export const documentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: documentStatusSchema.optional(),
});

export const createDocumentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200, 'Name is too long.'),
  originalFileName: z.string().trim().min(1, 'Original file name is required.').max(255, 'Original file name is too long.'),
  mimeType: z.string().trim().min(1, 'Mime type is required.').max(200, 'Mime type is too long.').refine((value) => /^[a-zA-Z0-9!#$%&'*+/^_`{|}~-]+\/[a-zA-Z0-9!#$%&'*+/^_`{|}~.-]+$/.test(value), {
    message: 'Mime type format is invalid.',
  }),
  fileSize: z.number().int().positive().max(52428800, 'File size is too large. Maximum is 50 MB.'),
  status: documentStatusSchema.default('UPLOADED'),
});

export const updateDocumentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200, 'Name is too long.').optional(),
  originalFileName: z.string().trim().min(1, 'Original file name is required.').max(255, 'Original file name is too long.').optional(),
  mimeType: z.string().trim().min(1, 'Mime type is required.').max(200, 'Mime type is too long.').refine((value) => /^[a-zA-Z0-9!#$%&'*+/^_`{|}~-]+\/[a-zA-Z0-9!#$%&'*+/^_`{|}~.-]+$/.test(value), {
    message: 'Mime type format is invalid.',
  }).optional(),
  fileSize: z.number().int().positive().max(52428800, 'File size is too large. Maximum is 50 MB.').optional(),
  status: documentStatusSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided.',
});
