import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const ORGANIZATION_ID = '14baa7a5-941d-413a-98b6-af03692e50bd';
const USER_EMAIL = 'nexarag-test@example.com';
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
    throw new Error('DATABASE_URL is required; no database changes were made.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is invalid; no database changes were made.');
  }

  const matchesExpectedDatabase =
    parsedUrl.protocol === EXPECTED_DATABASE.protocol &&
    parsedUrl.hostname === EXPECTED_DATABASE.hostname &&
    parsedUrl.port === EXPECTED_DATABASE.port &&
    parsedUrl.pathname === `/${EXPECTED_DATABASE.database}` &&
    parsedUrl.searchParams.get('schema') === EXPECTED_DATABASE.schema;

  if (!matchesExpectedDatabase) {
    throw new Error(
      'DATABASE_URL must point to the local NexaRAG database (localhost:5433/nexarag, schema public); no database changes were made.',
    );
  }

  return databaseUrl;
}

async function main(): Promise<void> {
  const databaseUrl = getValidatedDatabaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const [organization, user] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: ORGANIZATION_ID },
        select: { id: true },
      }),
      prisma.user.findUnique({
        where: { email: USER_EMAIL },
        select: { id: true, email: true },
      }),
    ]);

    if (!organization) {
      throw new Error(`Target organization ${ORGANIZATION_ID} was not found.`);
    }
    if (!user) {
      throw new Error(`Target account ${USER_EMAIL} was not found.`);
    }

    const existingMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: organization.id,
        },
      },
      select: { role: true },
    });

    if (existingMembership) {
      console.log(
        `No changes made: ${USER_EMAIL} is already a ${existingMembership.role} member of organization ${ORGANIZATION_ID}.`,
      );
      return;
    }

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: 'MEMBER',
      },
    });

    console.log(
      `Granted MEMBER access to ${USER_EMAIL} in organization ${ORGANIZATION_ID}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  console.error(`Failed to grant test membership: ${message}`);
  process.exitCode = 1;
});
