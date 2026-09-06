import { z } from 'zod';

const nonEmptyString = (field: string) => z.string().trim().min(1, `${field} is required.`).max(255, `${field} is too long.`);

export const knowledgeBaseIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Knowledge base id is required.'),
});

export const knowledgeBaseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  organizationId: z.string().trim().optional(),
});

export const createKnowledgeBaseSchema = z.object({
  organizationId: nonEmptyString('Organization id'),
  name: nonEmptyString('Name').max(200, 'Name is too long.'),
  description: z.string().trim().max(2000, 'Description is too long.').optional().nullable(),
});

export const updateKnowledgeBaseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200, 'Name is too long.').optional(),
  description: z.string().trim().max(2000, 'Description is too long.').nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided.',
});
