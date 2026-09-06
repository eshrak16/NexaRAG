import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required for authentication').default('change-me-in-production-change-me-in-production'),
  JWT_ACCESS_TOKEN_TTL: z.string().default('15m'),
  JWT_REFRESH_TOKEN_TTL: z.string().default('7d'),
  JWT_ISSUER: z.string().default('contextcore-api'),
  OPENROUTER_API_KEY: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(['openai-compatible']).default('openai-compatible'),
  EMBEDDING_MODEL: z.string().trim().min(1).default('text-embedding-3-small'),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536).refine((value) => value === 1536, {
    message: 'EMBEDDING_DIMENSIONS must be 1536 for text-embedding-3-small.',
  }),
  EMBEDDING_BATCH_SIZE: z.coerce.number().int().positive().max(256).default(32),
  EMBEDDING_RETRY_COUNT: z.coerce.number().int().min(0).max(5).default(2),
  CORS_ORIGIN: z.string().optional(),
  DATABASE_HOST: z.string().optional(),
  DATABASE_PORT: z.coerce.number().int().positive().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().int().positive().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsedEnv.data;
