import { NextRequest, NextResponse } from 'next/server';
import { threadRepository } from '@ai-workflow/database';

export async function GET() {
  try {
    const threads = await threadRepository.listThreads(30);
    return NextResponse.json({ threads });
  } catch {
    return NextResponse.json({ threads: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title = 'New Workflow Thread', workflowType = 'plan_execute_reflect' } = body;
    const thread = await threadRepository.createThread({
      title,
      workflowType,
    });
    return NextResponse.json({ thread });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
