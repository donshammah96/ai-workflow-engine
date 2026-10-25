import { compiledWorkflowGraph } from './graph.js';
import type { WorkflowState } from './state.js';
import { HumanMessage } from '@langchain/core/messages';
import { threadRepository, finOpsRepository } from '@ai-workflow/database';

export interface WorkflowStreamOptions {
  threadId?: string;
  model?: string;
  initialState?: Partial<WorkflowState>;
}

/**
 * Formats a custom Vercel AI SDK data stream chunk.
 * Protocol:
 * 0: "text chunk" (for text streaming)
 * 2: JSON (data stream annotation: e.g. node transitions, citations, plan)
 * d: JSON (custom data)
 */
export function formatDataChunk(type: string, payload: unknown): string {
  const jsonStr = JSON.stringify({ type, data: payload });
  return `2:${JSON.stringify([jsonStr])}\n`;
}

export function formatTextChunk(text: string): string {
  return `0:${JSON.stringify(text)}\n`;
}

/**
 * Executes the LangGraph multi-step orchestrator and yields streaming chunks formatted
 * for Vercel AI SDK `useChat` consumption.
 */
export async function* streamWorkflowExecution(
  prompt: string,
  options: WorkflowStreamOptions = {}
): AsyncGenerator<string, void, unknown> {
  let threadId = options.threadId;

  // Ensure thread exists in database
  if (!threadId) {
    try {
      const thread = await threadRepository.createThread({
        title: prompt.slice(0, 50),
        workflowType: 'plan_execute_reflect',
      });
      threadId = thread.id;
    } catch {
      threadId = 'thread_' + Math.random().toString(36).substring(2, 10);
    }
  }

  // Initial State
  const stateInput: Partial<WorkflowState> = {
    threadId,
    messages: [new HumanMessage(prompt)],
    telemetry: {
      nodeLatencies: {},
      promptTokens: 0,
      completionTokens: 0,
      model: options.model || 'gpt-4o',
      totalCostUsd: 0,
    },
    status: 'RUNNING',
    ...options.initialState,
  };

  yield formatDataChunk('thread_init', { threadId, model: options.model || 'gpt-4o' });

  let currentState: WorkflowState = stateInput as WorkflowState;

  try {
    // Stream through LangGraph nodes
    const graphStream = await compiledWorkflowGraph.stream(stateInput, {
      streamMode: 'updates',
    });

    let previousNode = 'START';

    for await (const update of graphStream) {
      for (const [nodeName, nodeState] of Object.entries(update)) {
        const partial = nodeState as Partial<WorkflowState>;
        currentState = { ...currentState, ...partial };

        // 1. Emit Node Transition
        yield formatDataChunk('node_transition', {
          from: previousNode,
          to: nodeName,
          status: currentState.status,
          timestamp: Date.now(),
        });
        previousNode = nodeName;

        // 2. Emit RAG Citations if present
        if (nodeName === 'memory_enrichment' && partial.retrievedContext) {
          yield formatDataChunk('rag_citations', {
            citations: partial.retrievedContext,
          });
        }

        // 3. Emit Live Plan Update if planner produced plan
        if (nodeName === 'planner' && partial.plan) {
          yield formatDataChunk('plan_update', {
            plan: partial.plan,
          });
        }

        // 4. Emit Tool Runner execution update
        if (nodeName === 'tool_runner' && partial.plan) {
          yield formatDataChunk('plan_update', {
            plan: partial.plan,
          });
        }

        // 5. Emit Telemetry & FinOps increments
        if (partial.telemetry) {
          yield formatDataChunk('finops_telemetry', {
            telemetry: partial.telemetry,
          });
        }

        // 6. Check if approval is required
        if (currentState.pendingApproval && currentState.status === 'AWAITING_APPROVAL') {
          yield formatDataChunk('approval_required', {
            threadId,
            pendingApproval: currentState.pendingApproval,
          });
          yield formatTextChunk(
            `\n\n⚠️ **Action Required: Human Authorization Gate**\n\nThe workflow paused execution at step \`${currentState.pendingApproval.stepId}\` to execute sensitive tool \`${currentState.pendingApproval.toolName}\`.\nPlease review and click **Approve** or **Reject** in the UI card below.`
          );
          return;
        }

        // 7. Emit synthesized response
        if (nodeName === 'synthesizer' && partial.finalResponse) {
          // Stream chunks of final response for smooth typing effect
          const words = partial.finalResponse.split(' ');
          for (let i = 0; i < words.length; i += 3) {
            const chunk = words.slice(i, i + 3).join(' ') + ' ';
            yield formatTextChunk(chunk);
          }
        }
      }
    }

    // Emit final completion event
    yield formatDataChunk('workflow_completed', {
      threadId,
      status: currentState.status,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    yield formatDataChunk('workflow_error', { error: errorMsg });
    yield formatTextChunk(`\n\n❌ Error during workflow execution: ${errorMsg}`);
  }
}

/**
 * Creates an HTTP Streaming Response compatible with Vercel AI SDK useChat.
 */
export function createDataStreamResponse(
  streamGenerator: AsyncGenerator<string, void, unknown>
): Response {
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamGenerator) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Vercel-AI-Data-Stream': 'v1',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
