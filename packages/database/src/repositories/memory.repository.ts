import { prisma } from '../client.js';
import { searchVectorSimilarity, type VectorSearchResult } from '../vector.js';
import type { Prisma, MemoryChunk } from '@prisma/client';

export interface InsertMemoryChunkInput {
  threadId?: string;
  namespace?: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export class MemoryRepository {
  private static inMemoryChunks: MemoryChunk[] = [];

  async insertChunk(input: InsertMemoryChunkInput): Promise<MemoryChunk> {
    const namespace = input.namespace ?? 'default';
    const metadata = (input.metadata ?? {}) as Prisma.InputJsonValue;
    const id = 'mem_' + Math.random().toString(36).substring(2, 11);

    const memoryRecord: MemoryChunk = {
      id,
      threadId: input.threadId ?? null,
      namespace,
      content: input.content,
      metadata: (input.metadata ?? {}) as Prisma.JsonValue,
      createdAt: new Date(),
    };

    MemoryRepository.inMemoryChunks.push(memoryRecord);

    if (process.env.DATABASE_URL) {
      if (input.embedding && input.embedding.length > 0) {
        const vectorString = `[${input.embedding.join(',')}]`;
        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO "MemoryChunk" (id, "threadId", namespace, content, metadata, embedding, "createdAt")
             VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector, NOW())`,
            id,
            input.threadId ?? null,
            namespace,
            input.content,
            JSON.stringify(input.metadata ?? {}),
            vectorString
          );
          return memoryRecord;
        } catch {
          // If vector column fails, try regular insert below
        }
      }

      try {
        return await prisma.memoryChunk.create({
          data: {
            id,
            threadId: input.threadId,
            namespace,
            content: input.content,
            metadata,
          },
        });
      } catch {}
    }

    return memoryRecord;
  }

  async searchVector(
    embedding: number[],
    options?: {
      namespace?: string;
      threadId?: string;
      topK?: number;
      threshold?: number;
    }
  ): Promise<VectorSearchResult[]> {
    return searchVectorSimilarity(embedding, options);
  }

  async searchKeyword(
    query: string,
    options?: {
      namespace?: string;
      threadId?: string;
      limit?: number;
    }
  ): Promise<MemoryChunk[]> {
    const namespace = options?.namespace ?? 'default';
    const limit = options?.limit ?? 10;

    if (process.env.DATABASE_URL) {
      try {
        return await prisma.memoryChunk.findMany({
          where: {
            namespace,
            ...(options?.threadId ? { threadId: options.threadId } : {}),
            content: {
              contains: query,
              mode: 'insensitive',
            },
          },
          take: limit,
          orderBy: { createdAt: 'desc' },
        });
      } catch {}
    }

    return MemoryRepository.inMemoryChunks
      .filter(
        (c) =>
          c.namespace === namespace &&
          (!options?.threadId || c.threadId === options.threadId) &&
          c.content.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, limit);
  }

  async listChunks(namespace = 'default', limit = 50): Promise<MemoryChunk[]> {
    if (process.env.DATABASE_URL) {
      try {
        return await prisma.memoryChunk.findMany({
          where: { namespace },
          take: limit,
          orderBy: { createdAt: 'desc' },
        });
      } catch {}
    }

    return MemoryRepository.inMemoryChunks
      .filter((c) => c.namespace === namespace)
      .slice(0, limit);
  }
}

export const memoryRepository = new MemoryRepository();
