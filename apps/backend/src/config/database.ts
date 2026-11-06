import { PrismaClient } from '@prisma/client';
import { env } from './env';

// In development, ts-node-dev re-imports modules on each restart.
// Without the global singleton pattern, each restart would create a new
// PrismaClient and exhaust PostgreSQL's connection pool.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
