import { Annotation } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';

export const PlanStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  assignedAgent: z.string().default('general_assistant'),
  toolNeeded: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']).default('pending'),
  result: z.unknown().optional(),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanSchema = z.object({
  objective: z.string(),
  steps: z.array(PlanStepSchema),
});

export type Plan = z.infer<typeof PlanSchema>;

export interface PendingApproval {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  stepId?: string;
  reason?: string;
}

export interface TelemetryState {
  nodeLatencies: Record<string, number>;
  promptTokens: number;
  completionTokens: number;
  model: string;
  totalCostUsd: number;
}

export interface Citation {
  id: string;
  content: string;
  score: number;
  source: string;
  metadata: Record<string, unknown>;
}

export const WorkflowStateAnnotation = Annotation.Root({
  threadId: Annotation<string>({
    reducer: (prev, next) => next ?? prev ?? 'default_thread',
    default: () => 'default_thread',
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => (next ? prev.concat(next) : prev),
    default: () => [],
  }),
  plan: Annotation<PlanStep[]>({
    reducer: (_, next) => next ?? [],
    default: () => [],
  }),
  retrievedContext: Annotation<Citation[]>({
    reducer: (_, next) => next ?? [],
    default: () => [],
  }),
  reflectionCount: Annotation<number>({
    reducer: (_, next) => (next !== undefined ? next : 0),
    default: () => 0,
  }),
  pendingApproval: Annotation<PendingApproval | null>({
    reducer: (_, next) => (next !== undefined ? next : null),
    default: () => null,
  }),
  telemetry: Annotation<TelemetryState>({
    reducer: (prev, next) => {
      if (!next) return prev;
      return {
        nodeLatencies: { ...prev.nodeLatencies, ...next.nodeLatencies },
        promptTokens: prev.promptTokens + (next.promptTokens || 0),
        completionTokens: prev.completionTokens + (next.completionTokens || 0),
        model: next.model || prev.model,
        totalCostUsd: prev.totalCostUsd + (next.totalCostUsd || 0),
      };
    },
    default: () => ({
      nodeLatencies: {},
      promptTokens: 0,
      completionTokens: 0,
      model: 'gpt-4o',
      totalCostUsd: 0,
    }),
  }),
  status: Annotation<'RUNNING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED'>({
    reducer: (_, next) => next ?? 'RUNNING',
    default: () => 'RUNNING',
  }),
  finalResponse: Annotation<string>({
    reducer: (_, next) => next ?? '',
    default: () => '',
  }),
});

export type WorkflowState = typeof WorkflowStateAnnotation.State;
