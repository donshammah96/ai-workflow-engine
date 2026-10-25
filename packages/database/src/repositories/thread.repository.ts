import { prisma } from '../client.js';
import type { Prisma, WorkflowThread } from '@prisma/client';

export class ThreadRepository {
  private static inMemoryThreads: WorkflowThread[] = [];

  async createThread(data: {
    title: string;
    workflowType?: string;
    metadata?: Record<string, unknown>;
  }): Promise<WorkflowThread> {
    const memoryRecord: WorkflowThread = {
      id: 'thread_' + Math.random().toString(36).substring(2, 10),
      title: data.title,
      workflowType: data.workflowType ?? 'plan_execute_reflect',
      metadata: (data.metadata ?? {}) as Prisma.JsonValue,
      summary: null,
      totalTokens: 0,
      totalCostUsd: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    ThreadRepository.inMemoryThreads.push(memoryRecord);

    try {
      if (process.env.DATABASE_URL) {
        return await prisma.workflowThread.create({
          data: {
            title: data.title,
            workflowType: data.workflowType ?? 'plan_execute_reflect',
            metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
      }
    } catch {}

    return memoryRecord;
  }

  async getThread(id: string): Promise<WorkflowThread | null> {
    try {
      if (process.env.DATABASE_URL) {
        const res = await prisma.workflowThread.findUnique({
          where: { id },
          include: {
            checkpoints: {
              orderBy: { stepNumber: 'asc' },
            },
          },
        });
        if (res) return res;
      }
    } catch {}

    return ThreadRepository.inMemoryThreads.find((t) => t.id === id) || null;
  }

  async listThreads(limit = 20): Promise<WorkflowThread[]> {
    try {
      if (process.env.DATABASE_URL) {
        return await prisma.workflowThread.findMany({
          orderBy: { updatedAt: 'desc' },
          take: limit,
        });
      }
    } catch {}

    return ThreadRepository.inMemoryThreads.slice(0, limit);
  }

  async updateSummary(id: string, summary: string): Promise<WorkflowThread> {
    const inMem = ThreadRepository.inMemoryThreads.find((t) => t.id === id);
    if (inMem) {
      inMem.summary = summary;
      inMem.updatedAt = new Date();
    }

    try {
      if (process.env.DATABASE_URL) {
        return await prisma.workflowThread.update({
          where: { id },
          data: { summary },
        });
      }
    } catch {}

    return inMem || {
      id,
      title: 'Thread',
      workflowType: 'plan_execute_reflect',
      metadata: {},
      summary,
      totalTokens: 0,
      totalCostUsd: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async deleteThread(id: string): Promise<WorkflowThread> {
    const idx = ThreadRepository.inMemoryThreads.findIndex((t) => t.id === id);
    let deleted: WorkflowThread | undefined;
    if (idx !== -1) {
      deleted = ThreadRepository.inMemoryThreads.splice(idx, 1)[0];
    }

    try {
      if (process.env.DATABASE_URL) {
        return await prisma.workflowThread.delete({
          where: { id },
        });
      }
    } catch {}

    return deleted || {
      id,
      title: 'Deleted Thread',
      workflowType: 'plan_execute_reflect',
      metadata: {},
      summary: null,
      totalTokens: 0,
      totalCostUsd: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

export const threadRepository = new ThreadRepository();
