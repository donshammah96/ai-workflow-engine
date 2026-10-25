import { describe, it, expect, beforeEach } from 'vitest';
import {
  estimateTokens,
  estimateMessagesTokens,
} from '../token-counter.js';
import {
  trimMessagesToTokenBudget,
} from '../short-term.js';
import {
  calculateRRFScore,
  HybridRetriever,
} from '../hybrid-retriever.js';
import {
  SemanticMemoryManager,
  semanticMemoryManager,
} from '../semantic-memory.js';

describe('Memory Store Suite', () => {
  beforeEach(() => {
    SemanticMemoryManager.clearInMemory();
  });

  describe('Short-Term Token Trimming', () => {
    it('should keep all messages if within token budget', () => {
      const messages = [
        { role: 'system', content: 'You are an AI assistant.' },
        { role: 'user', content: 'Hello there.' },
        { role: 'assistant', content: 'Hi, how can I help you today?' },
      ];

      const result = trimMessagesToTokenBudget(messages, 500);
      expect(result.length).toBe(3);
      expect(result[0]?.role).toBe('system');
    });

    it('should always preserve the system prompt when trimming', () => {
      const systemMsg = { role: 'system', content: 'Strict system guidelines.' };
      const longHistory = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `This is a long conversational turn number ${i} with substantial token payload to exceed budget.`,
      }));

      const fullMessages = [systemMsg, ...longHistory];
      const budget = 100; // Small budget

      const trimmed = trimMessagesToTokenBudget(fullMessages, budget);
      expect(trimmed.length).toBeGreaterThan(0);
      expect(trimmed[0]?.role).toBe('system');
      expect(trimmed[0]?.content).toBe('Strict system guidelines.');
    });

    it('should retain the latest messages over older intermediate turns', () => {
      const messages = [
        { role: 'system', content: 'System prompt.' },
        { role: 'user', content: 'Old question 1' },
        { role: 'assistant', content: 'Old answer 1' },
        { role: 'user', content: 'Old question 2' },
        { role: 'assistant', content: 'Old answer 2' },
        { role: 'user', content: 'Latest critical question' },
      ];

      const trimmed = trimMessagesToTokenBudget(messages, 45, { minLatestMessages: 1 });
      const contents = trimmed.map((m: { role: string; content: string }) => m.content);

      expect(contents).toContain('System prompt.');
      expect(contents).toContain('Latest critical question');
      expect(contents).not.toContain('Old question 1');
    });
  });

  describe('Reciprocal Rank Fusion (RRF)', () => {
    it('should compute correct RRF score for dense and sparse ranks with k=60', () => {
      // rank 1 dense: 1 / (60 + 1) = 1/61 = 0.016393
      const denseOnly = calculateRRFScore(1, undefined, 60);
      expect(denseOnly).toBeCloseTo(1 / 61, 5);

      // rank 1 dense and rank 1 sparse: 1/61 + 1/61 = 2/61 = 0.032786
      const hybridTop = calculateRRFScore(1, 1, 60);
      expect(hybridTop).toBeCloseTo(2 / 61, 5);

      // rank 1 hybrid should score strictly higher than rank 1 single modality
      expect(hybridTop).toBeGreaterThan(denseOnly);
    });
  });

  describe('Semantic Memory Manager', () => {
    it('should remember text and recall relevant chunks via similarity', async () => {
      await semanticMemoryManager.remember(
        'test_thread_1',
        'PostgreSQL pgvector extension enables cosine vector similarity index.',
        { topic: 'database' }
      );

      await semanticMemoryManager.remember(
        'test_thread_1',
        'Redis token bucket rate limiter protects API endpoints from burst traffic.',
        { topic: 'caching' }
      );

      const results = await semanticMemoryManager.recall('pgvector cosine vector database', {
        threadId: 'test_thread_1',
        topK: 2,
        threshold: 0.01,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.content).toContain('pgvector');
    });
  });
});
