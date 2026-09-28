import argon2 from 'argon2';
import dotenv from 'dotenv';
import { emitKeypressEvents } from 'node:readline';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const TARGET_EMAIL = 'nexarag-test@example.com';
const EXPECTED_DATABASE = {
  protocol: 'postgresql:',
  hostname: 'localhost',
  port: '5433',
  database: 'nexarag',
  schema: 'public',
} as const;

function getValidatedDatabaseUrl(): string {
  dotenv.config();

  if (process.env.NODE_ENV !== 'development') {
    throw new Error('This command is allowed only when NODE_ENV=development.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is invalid.');
  }

  const matchesExpectedDatabase =
    parsedUrl.protocol === EXPECTED_DATABASE.protocol &&
    parsedUrl.hostname === EXPECTED_DATABASE.hostname &&
    parsedUrl.port === EXPECTED_DATABASE.port &&
    parsedUrl.pathname === `/${EXPECTED_DATABASE.database}` &&
    parsedUrl.searchParams.get('schema') === EXPECTED_DATABASE.schema;

  if (!matchesExpectedDatabase) {
    throw new Error(
      'DATABASE_URL must point to the local NexaRAG development database (localhost:5433/nexarag, schema public).',
    );
  }

  return databaseUrl;
}

function readHiddenPassword(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(new Error('A terminal is required for secure password entry.'));
  }

  const input = process.stdin;
  emitKeypressEvents(input);
  const wasRaw = input.isRaw;

  return new Promise((resolve, reject) => {
    let password = '';

    const finish = (error?: Error): void => {
      input.off('keypress', onKeypress);
      input.setRawMode(wasRaw ?? false);
      input.pause();
      process.stdout.write('\n');
      if (error) {
        reject(error);
      } else {
        resolve(password);
      }
    };

    const onKeypress = (character: string, key: { name?: string; ctrl?: boolean; meta?: boolean }): void => {
      if (key.ctrl && key.name === 'c') {
        finish(new Error('Password entry canceled.'));
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        finish();
        return;
      }
      if (key.name === 'backspace') {
        password = Array.from(password).slice(0, -1).join('');
        return;
      }
      if (!key.ctrl && !key.meta && character && character >= ' ') {
        password += character;
      }
    };

    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on('keypress', onKeypress);
  });
}

async function main(): Promise<void> {
  const databaseUrl = getValidatedDatabaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const user = await prisma.user.findUnique({
      where: { email: TARGET_EMAIL },
      select: { id: true },
    });
    if (!user) {
      throw new Error(`Target account ${TARGET_EMAIL} was not found.`);
    }

    const password = await readHiddenPassword('New password (8–128 characters): ');
    if (password.length < 8 || password.length > 128) {
      throw new Error('Password must be between 8 and 128 characters. No changes were made.');
    }

    const confirmation = await readHiddenPassword('Confirm new password: ');
    if (password !== confirmation) {
      throw new Error('Passwords do not match. No changes were made.');
    }

    const passwordHash = await argon2.hash(password);
    const revokedAt = new Date();
    const result = await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      return transaction.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt },
      });
    });

    console.log(`Password reset completed for ${TARGET_EMAIL}.`);
    console.log(`Revoked ${result.count} existing refresh token(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  console.error(`Test-account password reset failed: ${message}`);
  process.exitCode = 1;
});
