import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().email('A valid email address is required.'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters long.').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters long.').max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email('A valid email address is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters long.').max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required.'),
});

export const logoutSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .passthrough();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
