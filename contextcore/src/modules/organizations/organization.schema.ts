import { z } from 'zod';

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Organization name must be at least 2 characters long.').max(120),
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Organization name must be at least 2 characters long.').max(120).optional(),
});

export const addMemberSchema = z.object({
  email: z.string().trim().email('A valid email address is required.'),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
});

export const organizationIdParamSchema = z.object({
  id: z.string().min(1, 'Organization id is required.'),
});

export const memberIdParamSchema = z.object({
  userId: z.string().min(1, 'User id is required.'),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
