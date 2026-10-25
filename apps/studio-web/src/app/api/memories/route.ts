import { NextRequest, NextResponse } from 'next/server';
import { memoryRepository } from '@ai-workflow/database';
import { semanticMemoryManager } from '@ai-workflow/memory-store';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const namespace = searchParams.get('namespace') || 'default';
    const chunks = await memoryRepository.listChunks(namespace, 50);
    return NextResponse.json({ chunks });
  } catch {
    return NextResponse.json({ chunks: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, namespace = 'default', threadId, metadata = {} } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text content is required' }, { status: 400 });
    }

    const memory = await semanticMemoryManager.remember(
      threadId || null,
      text,
      metadata,
      namespace
    );

    return NextResponse.json({ memory });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
