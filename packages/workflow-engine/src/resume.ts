import {
  checkpointRepository,
  CheckpointStatus,
  auditRepository,
} from '@ai-workflow/database';
import { toolRegistry } from '@ai-workflow/tool-registry';
import { streamWorkflowExecution, type WorkflowStreamOptions } from './stream-bridge.js';
import type { WorkflowState, PlanStep, PendingApproval } from './state.js';
import { HumanMessage } from '@langchain/core/messages';

export interface ResumeWorkflowInput {
  threadId: string;
  action: 'APPROVE' | 'REJECT';
  feedback?: string;
  approvedBy?: string;
}

export async function resumeWorkflowExecution(
  input: ResumeWorkflowInput,
  options: WorkflowStreamOptions = {}
): Promise<AsyncGenerator<string, void, unknown>> {
  const { threadId, action, feedback, approvedBy = 'Operator (Human-in-the-Loop)' } = input;

  // 1. Fetch latest awaiting approval checkpoint
  const checkpoint = await checkpointRepository.getLatestAwaitingApproval(threadId);

  if (!checkpoint) {
    throw new Error(`No pending approval checkpoint found for thread '${threadId}'`);
  }

  const snapshot = checkpoint.stateSnapshot as {
    plan?: PlanStep[];
    pendingApproval?: PendingApproval;
    reflectionCount?: number;
  };

  const pending = snapshot.pendingApproval;

  if (action === 'REJECT') {
    await checkpointRepository.updateCheckpointStatus(checkpoint.id, CheckpointStatus.FAILED);
    try {
      if (pending) {
        await auditRepository.recordToolAudit({
          threadId,
          stepId: pending.stepId,
          toolName: pending.toolName,
          args: pending.args,
          result: { rejectionFeedback: feedback || 'Rejected by human operator' },
          latencyMs: 0,
          status: 'REJECTED',
          requiresApproval: true,
          approvedBy,
        });
      }
    } catch {}

    async function* yieldRejection() {
      yield `2:${JSON.stringify([JSON.stringify({ type: 'approval_decision', data: { action: 'REJECT', threadId, feedback } })])}\n`;
      yield `0:${JSON.stringify(`\n\n⛔ **Operation Rejected:** Operator declined the pending action.\nReason/Feedback: ${feedback || 'No feedback provided.'}`)}\n`;
      yield `2:${JSON.stringify([JSON.stringify({ type: 'workflow_completed', data: { threadId, status: 'REJECTED' } })])}\n`;
    }

    return yieldRejection();
  }

  // 2. Action === 'APPROVE'
  await checkpointRepository.updateCheckpointStatus(checkpoint.id, CheckpointStatus.COMPLETED);

  // Execute the approved tool
  let toolResult: unknown = null;
  if (pending) {
    const tool = toolRegistry.get(pending.toolName);
    if (tool) {
      toolResult = await tool.execute(pending.args, {
        threadId,
        stepId: pending.stepId,
        approvedBy,
      });
    }
  }

  // Mark step as completed in plan
  const updatedPlan = (snapshot.plan || []).map((step) => {
    if (step.id === pending?.stepId) {
      return {
        ...step,
        status: 'completed' as const,
        result: toolResult,
      };
    }
    return step;
  });

  // Re-enter state machine with updated state and resume synthesis
  const resumedState: Partial<WorkflowState> = {
    threadId,
    plan: updatedPlan,
    pendingApproval: null,
    reflectionCount: (snapshot.reflectionCount || 0) + 1,
    status: 'RUNNING',
  };

  return streamWorkflowExecution(
    `Resume execution for thread ${threadId} following operator approval of ${pending?.toolName || 'tool'}.`,
    {
      threadId,
      model: options.model,
      initialState: resumedState,
    }
  );
}
