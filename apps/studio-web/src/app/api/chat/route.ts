import { NextRequest } from 'next/server';
import {
  streamWorkflowExecution,
  createDataStreamResponse,
} from '@ai-workflow/workflow-engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model = 'gpt-4o', threadId } = body;

    const latestMessage = messages && messages.length > 0
      ? messages[messages.length - 1]
      : null;

    const prompt = latestMessage?.content || 'Execute multi-step workflow.';

    const stream = streamWorkflowExecution(prompt, {
      threadId,
      model,
    });

    return createDataStreamResponse(stream);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
