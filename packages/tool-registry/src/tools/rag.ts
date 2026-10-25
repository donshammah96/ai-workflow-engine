import { z } from 'zod';
import { defineWorkflowTool } from '../define-tool.js';
import { hybridRetriever } from '@ai-workflow/memory-store';

export const RagInputSchema = z.object({
  query: z.string().describe('The search query or semantic question to look up in the vector knowledge base'),
  topK: z.number().optional().default(3).describe('Number of top relevant chunks to retrieve'),
  namespace: z.string().optional().default('default').describe('Memory namespace to search'),
});

export const RagOutputSchema = z.object({
  query: z.string(),
  resultsCount: z.number(),
  citations: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      score: z.number(),
      source: z.string(),
      metadata: z.record(z.unknown()),
    })
  ),
  contextSummary: z.string(),
});

export const knowledgeBaseRagTool = defineWorkflowTool({
  name: 'knowledge_base_rag',
  description: 'Searches the pgvector semantic knowledge base using hybrid retrieval (cosine vector similarity + full text BM25 fused via Reciprocal Rank Fusion) and returns grounded source citations.',
  inputSchema: RagInputSchema,
  outputSchema: RagOutputSchema,
  requiresApproval: false,
  timeoutMs: 5000,
  maxRetries: 2,
  execute: async ({ query, topK, namespace }) => {
    const docs = await hybridRetriever.retrieve(query, {
      topK,
      namespace,
    });

    const citations = docs.map((d) => ({
      id: d.id,
      content: d.content,
      score: Number(d.score.toFixed(4)),
      source: d.source,
      metadata: d.metadata,
    }));

    const contextSummary = citations.length > 0
      ? citations.map((c, i) => `[Citation ${i + 1} (Score: ${c.score}, Source: ${c.source})]:\n${c.content}`).join('\n\n')
      : 'No relevant citations found in the knowledge base.';

    return {
      query,
      resultsCount: citations.length,
      citations,
      contextSummary,
    };
  },
});
