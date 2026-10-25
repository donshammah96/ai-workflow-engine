import { semanticMemoryManager } from './semantic-memory.js';
import { memoryRepository } from '@ai-workflow/database';

export interface RetrievedDocument {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
  source: 'dense' | 'sparse' | 'hybrid';
  denseRank?: number;
  sparseRank?: number;
}

/**
 * Calculates Reciprocal Rank Fusion score.
 * Formula: sum(1 / (k + rank))
 * Default k = 60 (standard IR benchmark constant)
 */
export function calculateRRFScore(denseRank?: number, sparseRank?: number, k = 60): number {
  let score = 0;
  if (denseRank !== undefined && denseRank > 0) {
    score += 1 / (k + denseRank);
  }
  if (sparseRank !== undefined && sparseRank > 0) {
    score += 1 / (k + sparseRank);
  }
  return score;
}

export class HybridRetriever {
  /**
   * Combines dense vector cosine similarity with sparse keyword matching using RRF.
   */
  async retrieve(
    query: string,
    options: {
      namespace?: string;
      threadId?: string;
      topK?: number;
      rrfConstant?: number;
    } = {}
  ): Promise<RetrievedDocument[]> {
    const { namespace = 'default', threadId, topK = 5, rrfConstant = 60 } = options;

    // 1. Dense vector recall
    const denseResults = await semanticMemoryManager.recall(query, {
      namespace,
      threadId,
      topK: topK * 2,
      threshold: 0.1,
    });

    // 2. Sparse keyword recall
    let sparseResults: Array<{ id: string; content: string; metadata: Record<string, unknown> }> = [];
    try {
      const dbKeywordResults = await memoryRepository.searchKeyword(query, {
        namespace,
        threadId,
        limit: topK * 2,
      });
      sparseResults = dbKeywordResults.map((r) => ({
        id: r.id,
        content: r.content,
        metadata: (r.metadata as Record<string, unknown>) || {},
      }));
    } catch {
      // If DB is offline, perform simple keyword filter on dense results
      sparseResults = denseResults
        .filter((r) => r.content.toLowerCase().includes(query.toLowerCase()))
        .map((r) => ({ id: r.id, content: r.content, metadata: r.metadata }));
    }

    // 3. Compute RRF rankings
    const docMap = new Map<
      string,
      {
        id: string;
        content: string;
        metadata: Record<string, unknown>;
        denseRank?: number;
        sparseRank?: number;
      }
    >();

    denseResults.forEach((doc, idx) => {
      docMap.set(doc.id, {
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata,
        denseRank: idx + 1,
      });
    });

    sparseResults.forEach((doc, idx) => {
      const existing = docMap.get(doc.id);
      if (existing) {
        existing.sparseRank = idx + 1;
      } else {
        docMap.set(doc.id, {
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
          sparseRank: idx + 1,
        });
      }
    });

    // 4. Calculate final RRF scores
    const fused: RetrievedDocument[] = Array.from(docMap.values()).map((doc) => {
      const score = calculateRRFScore(doc.denseRank, doc.sparseRank, rrfConstant);
      let source: 'dense' | 'sparse' | 'hybrid' = 'hybrid';
      if (doc.denseRank && !doc.sparseRank) source = 'dense';
      if (!doc.denseRank && doc.sparseRank) source = 'sparse';

      return {
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata,
        score,
        source,
        denseRank: doc.denseRank,
        sparseRank: doc.sparseRank,
      };
    });

    // Sort descending by RRF score
    fused.sort((a, b) => b.score - a.score);
    return fused.slice(0, topK);
  }
}

export const hybridRetriever = new HybridRetriever();
