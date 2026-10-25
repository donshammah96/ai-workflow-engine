import { prisma } from '../client.js';

export interface TokenUsageRecord {
  threadId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface ModelPricing {
  promptCostPer1k: number;
  completionCostPer1k: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { promptCostPer1k: 0.0025, completionCostPer1k: 0.01 },
  'gpt-4o-mini': { promptCostPer1k: 0.00015, completionCostPer1k: 0.0006 },
  'claude-3-7-sonnet': { promptCostPer1k: 0.003, completionCostPer1k: 0.015 },
  'claude-3-5-sonnet': { promptCostPer1k: 0.003, completionCostPer1k: 0.015 },
  'gemini-2.5-pro': { promptCostPer1k: 0.00125, completionCostPer1k: 0.005 },
  'gemini-1.5-flash': { promptCostPer1k: 0.000075, completionCostPer1k: 0.0003 },
  'mock-ai': { promptCostPer1k: 0.0001, completionCostPer1k: 0.0002 },
};

export function calculateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o']!;
  const promptCost = (promptTokens / 1000) * pricing.promptCostPer1k;
  const completionCost = (completionTokens / 1000) * pricing.completionCostPer1k;
  return Number((promptCost + completionCost).toFixed(6));
}

export class FinOpsRepository {
  private static inMemoryFinOps = new Map<string, { totalTokens: number; totalCostUsd: number }>();

  async recordUsage(record: TokenUsageRecord): Promise<{ totalTokens: number; totalCostUsd: number }> {
    const cost = calculateCostUsd(record.model, record.promptTokens, record.completionTokens);
    const addedTokens = record.promptTokens + record.completionTokens;

    const current = FinOpsRepository.inMemoryFinOps.get(record.threadId) || { totalTokens: 0, totalCostUsd: 0 };
    const updated = {
      totalTokens: current.totalTokens + addedTokens,
      totalCostUsd: Number((current.totalCostUsd + cost).toFixed(6)),
    };
    FinOpsRepository.inMemoryFinOps.set(record.threadId, updated);

    try {
      if (process.env.DATABASE_URL) {
        return await prisma.workflowThread.update({
          where: { id: record.threadId },
          data: {
            totalTokens: { increment: addedTokens },
            totalCostUsd: { increment: cost },
          },
          select: {
            totalTokens: true,
            totalCostUsd: true,
          },
        });
      }
    } catch {}

    return updated;
  }

  async getThreadFinOps(threadId: string): Promise<{ totalTokens: number; totalCostUsd: number } | null> {
    try {
      if (process.env.DATABASE_URL) {
        const thread = await prisma.workflowThread.findUnique({
          where: { id: threadId },
          select: {
            totalTokens: true,
            totalCostUsd: true,
          },
        });
        if (thread) return thread;
      }
    } catch {}

    return FinOpsRepository.inMemoryFinOps.get(threadId) || null;
  }
}

export const finOpsRepository = new FinOpsRepository();
