import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const organization = await prisma.organization.upsert({
    where: { slug: 'development' },
    update: {},
    create: {
      name: 'Development Org',
      slug: 'development',
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'owner@contextcore.local' },
    update: {},
    create: {
      email: 'owner@contextcore.local',
      passwordHash: 'development-only-password-hash',
      name: 'ContextCore Owner',
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: organization.id,
      },
    },
    update: {
      role: 'OWNER',
    },
    create: {
      userId: user.id,
      organizationId: organization.id,
      role: 'OWNER',
    },
  });

  await prisma.knowledgeBase.upsert({
    where: {
      id: 'kb-development',
    },
    update: {},
    create: {
      id: 'kb-development',
      organizationId: organization.id,
      name: 'Development Knowledge Base',
      description: 'Seed knowledge base for local development.',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
