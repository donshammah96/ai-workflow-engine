import { memoryRepository, cosineSimilarity, type VectorSearchResult } from '@ai-workflow/database';
import { generateEmbedding } from './embeddings.js';

export interface MemoryRecord {
  id: string;
  threadId: string | null;
  namespace: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
  createdAt: Date;
}

export class SemanticMemoryManager {
  // In-memory fallback cache when PostgreSQL is offline or running fast unit tests
  private static inMemoryStore: MemoryRecord[] = [];

  async remember(
    threadId: string | null,
    text: string,
    metadata: Record<string, unknown> = {},
    namespace = 'default'
  ): Promise<MemoryRecord> {
    const embedding = await generateEmbedding(text);
    const id = 'mem_' + Math.random().toString(36).substring(2, 11);
    const record: MemoryRecord = {
      id,
      threadId,
      namespace,
      content: text,
      metadata,
      embedding,
      createdAt: new Date(),
    };

    // Store in in-memory store
    SemanticMemoryManager.inMemoryStore.push(record);

    // Persist to database if available
    try {
      await memoryRepository.insertChunk({
        threadId: threadId ?? undefined,
        namespace,
        content: text,
        metadata,
        embedding,
      });
    } catch (e) {
      // In offline/test mode, in-memory store handles it
    }

    return record;
  }

  async recall(
    query: string,
    options: {
      namespace?: string;
      threadId?: string;
      topK?: number;
      threshold?: number;
    } = {}
  ): Promise<VectorSearchResult[]> {
    const { namespace = 'default', threadId, topK = 5, threshold = 0.2 } = options;
    const queryEmbedding = await generateEmbedding(query);

    // Try database search first
    try {
      const dbResults = await memoryRepository.searchVector(queryEmbedding, {
        namespace,
        threadId,
        topK,
        threshold,
      });
      if (dbResults && dbResults.length > 0) {
        return dbResults;
      }
    } catch {
      // Fallback to in-memory store
    }

    // In-memory cosine search fallback
    const scored = SemanticMemoryManager.inMemoryStore
      .filter((rec) => rec.namespace === namespace && (!threadId || rec.threadId === threadId))
      .map((rec) => {
        const sim = cosineSimilarity(queryEmbedding, rec.embedding);
        return {
          id: rec.id,
          threadId: rec.threadId,
          namespace: rec.namespace,
          content: rec.content,
          metadata: rec.metadata,
          similarity: sim,
          createdAt: rec.createdAt,
        };
      })
      .filter((rec) => rec.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return scored;
  }

  static clearInMemory(): void {
    SemanticMemoryManager.inMemoryStore = [];
  }
}

export const semanticMemoryManager = new SemanticMemoryManager();
