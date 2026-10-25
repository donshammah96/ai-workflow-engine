import { NextRequest } from 'next/server';
import {
  resumeWorkflowExecution,
  createDataStreamResponse,
} from '@ai-workflow/workflow-engine';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const body = await req.json();
    const { action, feedback, approvedBy, model } = body;

    if (action !== 'APPROVE' && action !== 'REJECT') {
      return new Response(JSON.stringify({ error: 'Action must be APPROVE or REJECT' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stream = await resumeWorkflowExecution(
      {
        threadId,
        action,
        feedback,
        approvedBy,
      },
      { model }
    );

    return createDataStreamResponse(stream);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
