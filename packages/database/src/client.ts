import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export function createPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    return new PrismaClient();
  }
  if (!globalThis.prismaGlobal) {
    globalThis.prismaGlobal = new PrismaClient({
      log: process.env.DEBUG_PRISMA ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return globalThis.prismaGlobal;
}

export const prisma = createPrismaClient();
