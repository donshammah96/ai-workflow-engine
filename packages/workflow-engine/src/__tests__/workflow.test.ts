import { describe, it, expect } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { compiledWorkflowGraph } from '../graph.js';
import { streamWorkflowExecution } from '../stream-bridge.js';
import { resumeWorkflowExecution } from '../resume.js';
import { checkpointRepository, CheckpointStatus } from '@ai-workflow/database';
import type { WorkflowState } from '../state.js';

describe('Workflow Engine Suite (Plan-Execute-Reflect & HITL)', () => {
  it('should execute the Plan-Execute-Reflect state graph to completion for deterministic math tasks', async () => {
    const initialState: Partial<WorkflowState> = {
      threadId: 'test_thread_math_1',
      messages: [new HumanMessage('Calculate the sum of values: 25 + 75 * 2')],
      telemetry: {
        nodeLatencies: {},
        promptTokens: 0,
        completionTokens: 0,
        model: 'mock-ai',
        totalCostUsd: 0,
      },
      status: 'RUNNING',
    };

    const finalState = await compiledWorkflowGraph.invoke(initialState);

    expect(finalState).toBeDefined();
    expect(finalState.status).toBe('COMPLETED');
    expect(finalState.plan.length).toBeGreaterThan(0);
    expect(finalState.plan[0]?.status).toBe('completed');
    expect(finalState.finalResponse).toBeDefined();
    expect(finalState.finalResponse.length).toBeGreaterThan(10);
  });

  it('should pause execution at human_approval_gate when a sensitive tool is requested', async () => {
    const threadId = 'test_hitl_thread_' + Date.now();
    const initialState: Partial<WorkflowState> = {
      threadId,
      messages: [new HumanMessage('Deploy production configuration update (Trigger Webhook)')],
      telemetry: {
        nodeLatencies: {},
        promptTokens: 0,
        completionTokens: 0,
        model: 'mock-ai',
        totalCostUsd: 0,
      },
      status: 'RUNNING',
    };

    const intermediateState = await compiledWorkflowGraph.invoke(initialState);

    // Assert that the graph paused before executing the sensitive webhook tool
    expect(intermediateState.status).toBe('AWAITING_APPROVAL');
    expect(intermediateState.pendingApproval).toBeDefined();
    expect(intermediateState.pendingApproval?.toolName).toBe('production_action_webhook');

    // Verify checkpoint persistence
    const checkpoint = await checkpointRepository.getLatestAwaitingApproval(threadId);
    expect(checkpoint).toBeDefined();
    expect(checkpoint?.status).toBe(CheckpointStatus.AWAITING_APPROVAL);

    // Resume the workflow with operator approval
    const resumeStream = await resumeWorkflowExecution(
      {
        threadId,
        action: 'APPROVE',
        approvedBy: 'Lead DevOps Engineer (Test)',
      },
      { model: 'mock-ai' }
    );

    let resumedOutput = '';
    for await (const chunk of resumeStream) {
      resumedOutput += chunk;
    }

    // Assert that resumption completed successfully
    expect(resumedOutput).toContain('workflow_completed');
  });

  it('should stream data annotations compatible with Vercel AI SDK', async () => {
    const stream = streamWorkflowExecution('Search knowledge base for RAG documentation', {
      threadId: 'test_stream_1',
      model: 'mock-ai',
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    const joined = chunks.join('');

    // Must emit custom data events for node transitions
    expect(joined).toContain('node_transition');
    expect(joined).toContain('plan_update');
    expect(joined).toContain('finops_telemetry');
  });
});
