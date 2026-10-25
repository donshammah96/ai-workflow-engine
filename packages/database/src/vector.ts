import { prisma } from './client.js';

export interface VectorSearchResult {
  id: string;
  threadId: string | null;
  namespace: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  createdAt: Date;
}

export interface VectorSearchOptions {
  namespace?: string;
  threadId?: string;
  topK?: number;
  threshold?: number;
  filterMetadata?: Record<string, unknown>;
}

/**
 * Calculates in-memory cosine similarity between two numeric vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Executes a cosine similarity search against pgvector in PostgreSQL.
 * Falls back gracefully or allows raw execution.
 */
export async function searchVectorSimilarity(
  embedding: number[],
  options: VectorSearchOptions = {}
): Promise<VectorSearchResult[]> {
  const {
    namespace = 'default',
    threadId,
    topK = 5,
    threshold = 0.5,
  } = options;

  const vectorString = `[${embedding.join(',')}]`;

  if (!process.env.DATABASE_URL) {
    return [];
  }

  try {
    let results: Array<{
      id: string;
      threadId: string | null;
      namespace: string;
      content: string;
      metadata: unknown;
      similarity: number;
      createdAt: Date;
    }>;

    if (threadId) {
      results = await prisma.$queryRaw<typeof results>`
        SELECT 
          id,
          "threadId",
          namespace,
          content,
          metadata,
          1 - (embedding <=> ${vectorString}::vector) AS similarity,
          "createdAt"
        FROM "MemoryChunk"
        WHERE namespace = ${namespace}
          AND "threadId" = ${threadId}
          AND embedding IS NOT NULL
          AND (1 - (embedding <=> ${vectorString}::vector)) >= ${threshold}
        ORDER BY similarity DESC
        LIMIT ${topK};
      `;
    } else {
      results = await prisma.$queryRaw<typeof results>`
        SELECT 
          id,
          "threadId",
          namespace,
          content,
          metadata,
          1 - (embedding <=> ${vectorString}::vector) AS similarity,
          "createdAt"
        FROM "MemoryChunk"
        WHERE namespace = ${namespace}
          AND embedding IS NOT NULL
          AND (1 - (embedding <=> ${vectorString}::vector)) >= ${threshold}
        ORDER BY similarity DESC
        LIMIT ${topK};
      `;
    }

    return results.map((r) => ({
      ...r,
      metadata: (r.metadata as Record<string, unknown>) || {},
    }));
  } catch (error) {
    // If pgvector is not initialized or database is unavailable, log and return empty
    console.warn('[searchVectorSimilarity] Raw vector search failed or database offline, falling back.', error);
    return [];
  }
}
